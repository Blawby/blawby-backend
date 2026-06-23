// oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-argument, typescript/no-unsafe-return
import { config } from '@dotenvx/dotenvx';
import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import type { Stripe } from 'stripe';
import { stripePrices } from '../src/modules/subscriptions/database/schema/stripe-prices.schema';
import { subscriptionLineItems } from '../src/modules/subscriptions/database/schema/subscription-line-items.schema';
import { subscriptions } from '../src/modules/subscriptions/database/schema/subscriptions.schema';
import { organizations } from '../src/schema/better-auth-schema';
import { db } from '../src/shared/database';
import { stripe } from '../src/shared/utils/stripe-client';
import { fromStripeTimestamp } from '../src/shared/utils/timestamps';

config();

const logger = {
  info: (msg: string, ...args: unknown[]) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[ERROR] ${msg}`, ...args),
};

/**
 * Sync Stripe Subscriptions Script
 *
 * Capabilities:
 * 1. Syncs status/dates for existing subscriptions.
 * 2. Backfills missing stripeSubscriptionId using Customer ID.
 * 3. Handles duplicates: cancel duplicate/stale subscriptions in DB and Stripe.
 * 4. FULL HYDRATION: Syncs line items, updates Organization active link, ensures Plan name.
 *
 * Usage:
 *   npx dotenvx run -- npx tsx scripts/sync-stripe-subscriptions.ts [--dry-run]
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Period dates live on subscription items in the Stripe SDK, not on the subscription itself. */
const extractPeriodDates = (stripeSub: Stripe.Subscription) => {
  const [firstItem] = stripeSub.items.data;
  return {
    periodStart: firstItem ? fromStripeTimestamp(firstItem.current_period_start) : null,
    periodEnd: firstItem ? fromStripeTimestamp(firstItem.current_period_end) : null,
  };
};

const upsertLineItemTx = async (tx: Tx, itemData: typeof subscriptionLineItems.$inferInsert): Promise<void> => {
  const [existing] = await tx
    .select({ id: subscriptionLineItems.id })
    .from(subscriptionLineItems)
    .where(eq(subscriptionLineItems.stripe_subscription_item_id, itemData.stripe_subscription_item_id))
    .limit(1);

  if (existing) {
    await tx
      .update(subscriptionLineItems)
      .set({ ...itemData, updated_at: new Date() })
      .where(eq(subscriptionLineItems.id, existing.id));
  } else {
    await tx.insert(subscriptionLineItems).values(itemData);
  }
};

/**
 * Fully hydrate a subscription inside a transaction:
 * - Update Organization activeSubscriptionId
 * - Sync Line Items
 * - Ensure Plan Name matches DB
 */
const hydrateSubscriptionData = async (
  localSub: typeof subscriptions.$inferSelect,
  stripeSub: Stripe.Subscription,
  isDryRun: boolean
) => {
  const stripeSubId = stripeSub.id;
  const stripeCustomerId = typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id;
  const { status } = stripeSub;
  const rawItems = stripeSub.items.data;

  if (status !== 'active' && status !== 'trialing') {
    return;
  }

  if (isDryRun) {
    logger.info(
      `[DRY RUN] Would hydrate data for ${localSub.id} (${stripeSubId}): Link Org, Sync ${rawItems.length} Line Items.`
    );
    return;
  }

  // Script-level exception: db.transaction() used directly (no UoW/ServiceContext needed in scripts).
  await db.transaction(async (tx: Tx) => {
    let orgId = localSub.referenceId;

    // 0. If referenceId missing, find org by Stripe Customer ID
    if (!orgId && stripeCustomerId) {
      const [org] = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.stripeCustomerId, stripeCustomerId))
        .limit(1);

      if (org) {
        orgId = org.id;
        await tx
          .update(subscriptions)
          .set({ referenceId: org.id, updatedAt: new Date() })
          .where(eq(subscriptions.id, localSub.id));
        logger.info(`Linked Subscription ${localSub.id} to Organization ${org.id} via Customer ID ${stripeCustomerId}`);
      } else {
        logger.warn(`Could not find Organization for Customer ID ${stripeCustomerId} (Subscription ${localSub.id})`);
      }
    }

    // 1. Link active subscription to organization
    if (orgId) {
      await tx
        .update(organizations)
        .set({ activeSubscriptionId: localSub.id, stripeCustomerId })
        .where(eq(organizations.id, orgId));
      logger.info(`Updated Organization ${orgId}: Linked active record ${localSub.id}`);
    }

    // 2. Resolve Plan Name from first item's price
    const [firstItem] = rawItems;
    if (firstItem) {
      const [dbPrice] = await tx
        .select({ name: stripePrices.name })
        .from(stripePrices)
        .where(eq(stripePrices.stripe_price_id, firstItem.price.id))
        .limit(1);

      if (dbPrice?.name && localSub.plan !== dbPrice.name) {
        await tx
          .update(subscriptions)
          .set({ plan: dbPrice.name, updatedAt: new Date() })
          .where(eq(subscriptions.id, localSub.id));
        logger.info(`Updated Subscription ${localSub.id}: Fixed plan name '${localSub.plan}' -> '${dbPrice.name}'`);
      } else if (!dbPrice) {
        logger.warn(`Could not resolve plan for price ID ${firstItem.price.id}`);
      }
    }

    // 3. Sync Line Items
    if (rawItems.length === 0) {
      logger.warn(`[HYDRATE] No line items found in Stripe object for ${localSub.id}`);
    } else {
      logger.info(`[HYDRATE] Processing ${rawItems.length} line items for ${localSub.id}...`);
    }

    for (const item of rawItems) {
      const { price } = item;
      try {
        // oxlint-disable-next-line no-await-in-loop
        await upsertLineItemTx(tx, {
          subscription_id: localSub.id,
          stripe_subscription_item_id: item.id,
          stripe_price_id: price.id,
          item_type: 'base_fee',
          description: price.nickname ?? (typeof price.product === 'string' ? price.product : null),
          quantity: item.quantity ?? 1,
          unit_amount: price.unit_amount != null ? (price.unit_amount / 100).toString() : null,
          metadata: {},
        });
        logger.info(`[HYDRATE] Synced line item ${item.id} for ${localSub.id}`);
      } catch (err) {
        logger.error(`[HYDRATE] Failed to sync line item ${item.id}:`, err);
      }
    }
    logger.info(`Synced ${rawItems.length} line items for ${localSub.id}`);
  });
};

const buildUpdates = (
  stripeSub: Stripe.Subscription,
  localSub: typeof subscriptions.$inferSelect
): { updates: Partial<typeof subscriptions.$inferInsert>; changes: string[] } => {
  const updates: Partial<typeof subscriptions.$inferInsert> = {};
  const changes: string[] = [];

  if (stripeSub.status !== localSub.status) {
    updates.status = stripeSub.status;
    changes.push(`Status: ${localSub.status} -> ${stripeSub.status}`);
  }

  const { periodStart, periodEnd } = extractPeriodDates(stripeSub);

  if (periodStart && periodStart.getTime() !== localSub.periodStart?.getTime()) {
    updates.periodStart = periodStart;
    changes.push(`Period Start: ${localSub.periodStart?.toISOString()} -> ${periodStart.toISOString()}`);
  }

  if (periodEnd && periodEnd.getTime() !== localSub.periodEnd?.getTime()) {
    updates.periodEnd = periodEnd;
    changes.push(`Period End: ${localSub.periodEnd?.toISOString()} -> ${periodEnd.toISOString()}`);
  }

  if (stripeSub.cancel_at_period_end !== localSub.cancelAtPeriodEnd) {
    updates.cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
    changes.push(`Cancel At Period End: ${localSub.cancelAtPeriodEnd} -> ${stripeSub.cancel_at_period_end}`);
  }

  return { updates, changes };
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(`
Usage: npx dotenvx run -- npx tsx scripts/sync-stripe-subscriptions.ts [--dry-run]

Options:
  --dry-run  Log what would change without modifying the database
  --help     Show this help message
`);
    process.exit(0);
  }
  const isDryRun = args.includes('--dry-run');

  logger.info(`Starting Stripe subscription sync... ${isDryRun ? '(DRY RUN)' : ''}`);

  let updatedCount = 0;
  let errorCount = 0;

  try {
    // ─── Pass 1: Subscriptions with a stripeSubscriptionId ──────────────
    const withSubId = await db.select().from(subscriptions).where(isNotNull(subscriptions.stripeSubscriptionId));
    logger.info(`Pass 1: Found ${withSubId.length} subscriptions with Stripe Subscription IDs.`);

    for (const sub of withSubId) {
      if (sub.stripeSubscriptionId) {
        try {
          // oxlint-disable-next-line no-await-in-loop
          const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
          const { updates, changes } = buildUpdates(stripeSub, sub);
          const needsUpdate = Object.keys(updates).length > 0;

          if (needsUpdate) {
            if (isDryRun) {
              logger.info(`[DRY RUN] Would update ${sub.id} (${sub.stripeSubscriptionId}): ${changes.join(', ')}`);
            } else {
              // oxlint-disable-next-line no-await-in-loop
              await db
                .update(subscriptions)
                .set({ ...updates, updatedAt: new Date() })
                .where(eq(subscriptions.id, sub.id));
              logger.info(`Updated ${sub.id} (${sub.stripeSubscriptionId}): ${changes.join(', ')}`);
              updatedCount++;
            }
          }

          if (stripeSub.status === 'active' || stripeSub.status === 'trialing') {
            // oxlint-disable-next-line no-await-in-loop
            await hydrateSubscriptionData(sub, stripeSub, isDryRun);
            if (!isDryRun) {
              updatedCount++;
            }
          }
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          const isMissing =
            (typeof err === 'object' &&
              err !== null &&
              'code' in err &&
              (err as Record<string, unknown>).code === 'resource_missing') ||
            errorMessage.includes('No such subscription');

          if (isMissing) {
            if (sub.status !== 'canceled') {
              if (isDryRun) {
                logger.info(
                  `[DRY RUN] ${sub.id} (${sub.stripeSubscriptionId}) not found in Stripe. Would mark canceled.`
                );
              } else {
                // oxlint-disable-next-line no-await-in-loop
                await db
                  .update(subscriptions)
                  .set({ status: 'canceled', cancelAtPeriodEnd: false, updatedAt: new Date() })
                  .where(eq(subscriptions.id, sub.id));
                logger.info(`${sub.id} (${sub.stripeSubscriptionId}) not found in Stripe. Marked canceled.`);
                updatedCount++;
              }
            } else {
              logger.info(`${sub.id} (${sub.stripeSubscriptionId}) not found in Stripe. Already canceled.`);
            }
          } else {
            logger.error(`Error syncing ${sub.id} (${sub.stripeSubscriptionId}): ${errorMessage}`);
            errorCount++;
          }
        }
      }
    }

    // ─── Pass 2: Subscriptions without stripeSubscriptionId ──────────────
    const withoutSubId = await db
      .select()
      .from(subscriptions)
      .where(and(isNull(subscriptions.stripeSubscriptionId), isNotNull(subscriptions.stripeCustomerId)));
    logger.info(`Pass 2: Found ${withoutSubId.length} subscriptions missing Stripe ID (have Customer ID).`);

    const subsByCustomer = new Map<string, (typeof subscriptions.$inferSelect)[]>();
    for (const sub of withoutSubId) {
      const cid = sub.stripeCustomerId!;
      const bucket = subsByCustomer.get(cid) ?? [];
      bucket.push(sub);
      subsByCustomer.set(cid, bucket);
    }

    for (const [customerId, localSubs] of subsByCustomer) {
      try {
        // oxlint-disable-next-line no-await-in-loop
        const linkedSubs = await db
          .select()
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.stripeCustomerId, customerId),
              isNotNull(subscriptions.stripeSubscriptionId),
              ne(subscriptions.status, 'canceled')
            )
          );

        if (linkedSubs.length > 0) {
          for (const sub of localSubs) {
            if (sub.status !== 'canceled') {
              if (isDryRun) {
                logger.info(
                  `[DRY RUN] ${sub.id}: Found existing linked sub for customer ${customerId}. Marking this stale duplicate as canceled.`
                );
              } else {
                // oxlint-disable-next-line no-await-in-loop
                await db
                  .update(subscriptions)
                  .set({ status: 'canceled', updatedAt: new Date() })
                  .where(eq(subscriptions.id, sub.id));
                logger.info(`${sub.id}: Marked as canceled (stale duplicate).`);
                updatedCount++;
              }
            }
          }
        } else {
          // oxlint-disable-next-line no-await-in-loop
          const customerSubs = await stripe.subscriptions.list({ customer: customerId, limit: 10, status: 'all' });
          const activeStripeSubs = customerSubs.data.filter((s) => s.status === 'active' || s.status === 'trialing');

          if (activeStripeSubs.length === 0) {
            for (const sub of localSubs) {
              if (sub.status !== 'canceled') {
                if (isDryRun) {
                  logger.info(
                    `[DRY RUN] ${sub.id}: No active Stripe subs for customer ${customerId}. Marking canceled.`
                  );
                } else {
                  // oxlint-disable-next-line no-await-in-loop
                  await db
                    .update(subscriptions)
                    .set({ status: 'canceled', updatedAt: new Date() })
                    .where(eq(subscriptions.id, sub.id));
                  logger.info(`${sub.id}: Marked as canceled (no active Stripe sub).`);
                  updatedCount++;
                }
              }
            }
          } else {
            activeStripeSubs.sort((a, b) => b.created - a.created);
            const [winnerStripeSub] = activeStripeSubs;
            const loserStripeSubs = activeStripeSubs.slice(1);

            if (loserStripeSubs.length > 0) {
              logger.warn(
                `Customer ${customerId} has ${activeStripeSubs.length} active subscriptions in Stripe! Keeping ${winnerStripeSub.id}, canceling ${loserStripeSubs.length} duplicates.`
              );
              for (const loser of loserStripeSubs) {
                if (isDryRun) {
                  logger.info(`[DRY RUN] Would cancel duplicate Stripe subscription ${loser.id}`);
                } else {
                  try {
                    // oxlint-disable-next-line no-await-in-loop
                    await stripe.subscriptions.cancel(loser.id);
                    logger.info(`Canceled duplicate Stripe subscription ${loser.id}`);
                  } catch (cancelErr) {
                    logger.error(
                      `Failed to cancel duplicate Stripe subscription ${loser.id}: ${cancelErr instanceof Error ? cancelErr.message : String(cancelErr)}`
                    );
                  }
                }
              }
            }

            localSubs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            const [winnerLocalSub] = localSubs;
            const loserLocalSubs = localSubs.slice(1);

            for (const loser of loserLocalSubs) {
              if (loser.status !== 'canceled') {
                if (isDryRun) {
                  logger.info(`[DRY RUN] ${loser.id}: Duplicate local row. Marking canceled.`);
                } else {
                  // oxlint-disable-next-line no-await-in-loop
                  await db
                    .update(subscriptions)
                    .set({ status: 'canceled', updatedAt: new Date() })
                    .where(eq(subscriptions.id, loser.id));
                  logger.info(`${loser.id}: Marked as canceled (duplicate local row).`);
                  updatedCount++;
                }
              }
            }

            const { updates, changes } = buildUpdates(winnerStripeSub, winnerLocalSub);
            updates.stripeSubscriptionId = winnerStripeSub.id;
            changes.push(`Stripe Sub ID: null -> ${winnerStripeSub.id}`);

            if (isDryRun) {
              logger.info(`[DRY RUN] Would link ${winnerLocalSub.id} to ${winnerStripeSub.id}: ${changes.join(', ')}`);
              // oxlint-disable-next-line no-await-in-loop
              await hydrateSubscriptionData(winnerLocalSub, winnerStripeSub, true);
            } else {
              // oxlint-disable-next-line no-await-in-loop
              await db
                .update(subscriptions)
                .set({ ...updates, updatedAt: new Date() })
                .where(eq(subscriptions.id, winnerLocalSub.id));
              logger.info(`Linked ${winnerLocalSub.id} to ${winnerStripeSub.id}: ${changes.join(', ')}`);
              updatedCount++;
              // oxlint-disable-next-line no-await-in-loop
              await hydrateSubscriptionData(winnerLocalSub, winnerStripeSub, false);
              updatedCount++;
            }
          }
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error(`Error processing customer ${customerId}: ${errorMessage}`);
        errorCount++;
      }
    }

    logger.info(`Sync complete. Updated: ${updatedCount}, Errors: ${errorCount}`);
    process.exit(0);
  } catch (error) {
    logger.error('Fatal error during sync:', error);
    process.exit(1);
  }
};

main().catch((err) => {
  console.error('[ERROR] Unhandled error in main:', err);
  process.exit(1);
});
