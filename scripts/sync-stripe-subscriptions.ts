import { config } from '@dotenvx/dotenvx';
config();
import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import { organizations, subscriptions } from '../src/schema/better-auth-schema';
import { db } from '../src/shared/database';
import { stripe } from '../src/shared/utils/stripe-client';
import { subscriptionRepository } from '../src/modules/subscriptions/database/queries/subscription.repository';
import { subscriptionLineItems } from '../src/modules/subscriptions/database/schema/subscriptionLineItems.schema';

// Logger wrapper
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

/** Extract period dates from a Stripe subscription response. */
function extractPeriodDates(stripeSub: Record<string, unknown>) {
  const items = stripeSub.items as Record<string, unknown> | undefined;
  const itemsData = (items?.data as Array<Record<string, unknown>>) ?? [];
  const firstItem = itemsData[0];

  const start = firstItem?.current_period_start ?? stripeSub.current_period_start;
  const end = firstItem?.current_period_end ?? stripeSub.current_period_end;

  return {
    periodStart: typeof start === 'number' ? new Date(start * 1000) : null,
    periodEnd: typeof end === 'number' ? new Date(end * 1000) : null,
  };
}

/** Safely extract line item fields from an untyped Stripe item. */
function parseStripeItem(item: Record<string, unknown>) {
  const price = item.price as Record<string, unknown> | undefined;
  return {
    itemId: item.id as string | undefined,
    priceId: price?.id as string | undefined,
    nickname: price?.nickname as string | undefined,
    product: price?.product as string | undefined,
    quantity: (item.quantity as number) || 1,
    unitAmount: typeof price?.unit_amount === 'number' ? price.unit_amount : null,
  };
}

/**
 * Fully hydrate a subscription inside a transaction:
 * - Update Organization activeSubscriptionId
 * - Sync Line Items
 * - Ensure Plan Name matches DB
 */
async function hydrateSubscriptionData(
  localSub: typeof subscriptions.$inferSelect,
  stripeSub: Record<string, unknown>,
  isDryRun: boolean,
) {
  const stripeSubId = stripeSub.id as string;
  const stripeCustomerId = stripeSub.customer as string;
  const status = stripeSub.status as string;
  const rawItems = ((stripeSub.items as Record<string, unknown>)?.data as Array<Record<string, unknown>>) ?? [];

  // Only proceed with hydration if active or trialing
  if (status !== 'active' && status !== 'trialing') return;

  if (isDryRun) {
    logger.info(`[DRY RUN] Would hydrate data for ${localSub.id} (${stripeSubId}): Link Org, Sync ${rawItems.length} Line Items.`);
    return;
  }

  await db.transaction(async (tx) => {
    // 1. Update Organization (Link Active Subscription)
    if (localSub.referenceId) {
      await tx.update(organizations)
        .set({
          activeSubscriptionId: localSub.id,
          stripeCustomerId,
        })
        .where(eq(organizations.id, localSub.referenceId));
      logger.info(`Updated Organization ${localSub.referenceId}: Linked active record ${localSub.id}`);
    }

    // 2. Resolve Plan Name from first item's price
    if (rawItems.length > 0) {
      const parsed = parseStripeItem(rawItems[0]);
      if (parsed.priceId) {
        const dbPlan = await subscriptionRepository.findPlanByStripePriceId(tx, parsed.priceId);
        if (dbPlan) {
          if (localSub.plan !== dbPlan.name) {
            await tx.update(subscriptions)
              .set({ plan: dbPlan.name, updatedAt: new Date() })
              .where(eq(subscriptions.id, localSub.id));
            logger.info(`Updated Subscription ${localSub.id}: Fixed plan name '${localSub.plan}' -> '${dbPlan.name}'`);
          }
        } else {
          logger.warn(`Could not resolve plan for price ID ${parsed.priceId}`);
        }
      }
    }

    // 3. Sync Line Items (delete + batch insert for clean state)
    await subscriptionRepository.deleteLineItemsBySubscriptionId(tx, localSub.id);

    for (const rawItem of rawItems) {
      const parsed = parseStripeItem(rawItem);
      if (!parsed.itemId || !parsed.priceId) {
        logger.warn(`Skipping line item with missing ID or price ID for ${localSub.id}`);
        continue;
      }
      await tx.insert(subscriptionLineItems
      ).values({
        subscription_id: localSub.id,
        stripe_subscription_item_id: parsed.itemId,
        stripe_price_id: parsed.priceId,
        item_type: 'base_fee',
        description: parsed.nickname || parsed.product,
        quantity: parsed.quantity,
        unit_amount: parsed.unitAmount ? (parsed.unitAmount / 100).toString() : null,
        metadata: {},
      });
    }
    logger.info(`Synced ${rawItems.length} line items for ${localSub.id}`);
  });
}

/** Build an updates object by comparing Stripe data with local subscription. */
function buildUpdates(
  stripeSub: Record<string, unknown>,
  localSub: typeof subscriptions.$inferSelect,
) {
  const updates: Partial<typeof subscriptions.$inferInsert> = {};
  const changes: string[] = [];

  // Status
  if (typeof stripeSub.status === 'string' && stripeSub.status !== localSub.status) {
    updates.status = stripeSub.status;
    changes.push(`Status: ${localSub.status} -> ${stripeSub.status}`);
  }

  // Period dates
  const { periodStart, periodEnd } = extractPeriodDates(stripeSub);

  if (periodStart && periodStart.getTime() !== localSub.periodStart?.getTime()) {
    updates.periodStart = periodStart;
    changes.push(`Period Start: ${localSub.periodStart?.toISOString()} -> ${periodStart.toISOString()}`);
  }

  if (periodEnd && periodEnd.getTime() !== localSub.periodEnd?.getTime()) {
    updates.periodEnd = periodEnd;
    changes.push(`Period End: ${localSub.periodEnd?.toISOString()} -> ${periodEnd.toISOString()}`);
  }

  // Cancel at period end
  if (
    typeof stripeSub.cancel_at_period_end === 'boolean' &&
    stripeSub.cancel_at_period_end !== localSub.cancelAtPeriodEnd
  ) {
    updates.cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
    changes.push(`Cancel At Period End: ${localSub.cancelAtPeriodEnd} -> ${stripeSub.cancel_at_period_end}`);
  }

  return { updates, changes };
}

const main = async function main() {
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
    const withSubId = await db
      .select()
      .from(subscriptions)
      .where(isNotNull(subscriptions.stripeSubscriptionId));

    logger.info(`Pass 1: Found ${withSubId.length} subscriptions with Stripe Subscription IDs.`);

    for (const sub of withSubId) {
      if (!sub.stripeSubscriptionId) continue;

      try {
        const stripeResponse = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
        const stripeSub = stripeResponse as unknown as Record<string, unknown>;
        const { updates, changes } = buildUpdates(stripeSub, sub);

        const needsUpdate = Object.keys(updates).length > 0;

        if (needsUpdate) {
          if (isDryRun) {
            logger.info(
              `[DRY RUN] Would update ${sub.id} (${sub.stripeSubscriptionId}): ${changes.join(', ')}`,
            );
          } else {
            await db
              .update(subscriptions)
              .set({ ...updates, updatedAt: new Date() })
              .where(eq(subscriptions.id, sub.id));
            logger.info(`Updated ${sub.id} (${sub.stripeSubscriptionId}): ${changes.join(', ')}`);
            updatedCount++;
          }
        }

        // Hydrate active subs to ensure data integrity (missing line items, etc.)
        if (stripeSub.status === 'active' || stripeSub.status === 'trialing') {
          await hydrateSubscriptionData(sub, stripeSub, isDryRun);
          if (!isDryRun) updatedCount++;
        }

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const isMissing =
          (typeof err === 'object' && err !== null && 'code' in err &&
            (err as Record<string, unknown>).code === 'resource_missing') ||
          errorMessage.includes('No such subscription');

        if (isMissing) {
          if (sub.status !== 'canceled') {
            if (isDryRun) {
              logger.info(`[DRY RUN] ${sub.id} (${sub.stripeSubscriptionId}) not found in Stripe. Would mark canceled.`);
            } else {
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

    // ─── Pass 2: Subscriptions without stripeSubscriptionId ──────────────
    // Group them by customer ID to handle duplicates
    const withoutSubId = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          isNull(subscriptions.stripeSubscriptionId),
          isNotNull(subscriptions.stripeCustomerId),
        ),
      );

    logger.info(`Pass 2: Found ${withoutSubId.length} subscriptions missing Stripe ID (have Customer ID).`);

    // Group by customer
    const subsByCustomer = new Map<string, typeof subscriptions.$inferSelect[]>();
    withoutSubId.forEach(sub => {
      const cid = sub.stripeCustomerId!;
      if (!subsByCustomer.has(cid)) subsByCustomer.set(cid, []);
      subsByCustomer.get(cid)!.push(sub);
    });

    for (const [customerId, localSubs] of subsByCustomer) {
      try {
        // Check if DB already has a VALID/LINKED subscription for this customer
        const linkedSubs = await db.select().from(subscriptions).where(and(
          eq(subscriptions.stripeCustomerId, customerId),
          isNotNull(subscriptions.stripeSubscriptionId),
          ne(subscriptions.status, 'canceled'),
        ));

        // If we already have a linked active sub, then ALL these 'withoutSubId' rows are stale duplicates
        if (linkedSubs.length > 0) {
          for (const sub of localSubs) {
            if (sub.status !== 'canceled') {
              if (isDryRun) {
                logger.info(`[DRY RUN] ${sub.id}: Found existing linked sub for customer ${customerId}. Marking this stale duplicate as canceled.`);
              } else {
                await db.update(subscriptions).set({ status: 'canceled', updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
                logger.info(`${sub.id}: Marked as canceled (stale duplicate).`);
                updatedCount++;
              }
            }
          }
          continue;
        }

        // Otherwise, fetch from Stripe to find the "real" subscription
        const customerSubs = await stripe.subscriptions.list({ customer: customerId, limit: 10, status: 'all' });
        const activeStripeSubs = customerSubs.data.filter(s => s.status === 'active' || s.status === 'trialing');

        if (activeStripeSubs.length === 0) {
          // No active subs in Stripe -> Mark all local as canceled
          for (const sub of localSubs) {
            if (sub.status !== 'canceled') {
              if (isDryRun) {
                logger.info(`[DRY RUN] ${sub.id}: No active Stripe subs for customer ${customerId}. Marking canceled.`);
              } else {
                await db.update(subscriptions).set({ status: 'canceled', updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
                logger.info(`${sub.id}: Marked as canceled (no active Stripe sub).`);
                updatedCount++;
              }
            }
          }
          continue;
        }

        // Pick the BEST active subscription (Most recently created)
        activeStripeSubs.sort((a, b) => b.created - a.created);
        const winnerStripeSub = activeStripeSubs[0];
        const loserStripeSubs = activeStripeSubs.slice(1);

        // Cancel duplicate Stripe subscriptions (not just local rows)
        if (loserStripeSubs.length > 0) {
          logger.warn(`Customer ${customerId} has ${activeStripeSubs.length} active subscriptions in Stripe! Keeping ${winnerStripeSub.id}, canceling ${loserStripeSubs.length} duplicates.`);
          for (const loser of loserStripeSubs) {
            if (isDryRun) {
              logger.info(`[DRY RUN] Would cancel duplicate Stripe subscription ${loser.id}`);
            } else {
              try {
                await stripe.subscriptions.cancel(loser.id);
                logger.info(`Canceled duplicate Stripe subscription ${loser.id}`);
              } catch (cancelErr) {
                logger.error(`Failed to cancel duplicate Stripe subscription ${loser.id}: ${cancelErr instanceof Error ? cancelErr.message : String(cancelErr)}`);
              }
            }
          }
        }

        // Assign winner to the MOST RECENT local subscription row
        localSubs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const winnerLocalSub = localSubs[0];
        const loserLocalSubs = localSubs.slice(1);

        // Process Losers -> Cancel in DB
        for (const loser of loserLocalSubs) {
          if (loser.status !== 'canceled') {
            if (isDryRun) {
              logger.info(`[DRY RUN] ${loser.id}: Duplicate local row. Marking canceled.`);
            } else {
              await db.update(subscriptions).set({ status: 'canceled', updatedAt: new Date() }).where(eq(subscriptions.id, loser.id));
              logger.info(`${loser.id}: Marked as canceled (duplicate local row).`);
              updatedCount++;
            }
          }
        }

        // Process Winner -> Update and Hydrate
        const stripeSub = winnerStripeSub as unknown as Record<string, unknown>;
        const { updates, changes } = buildUpdates(stripeSub, winnerLocalSub);

        updates.stripeSubscriptionId = winnerStripeSub.id;
        changes.push(`Stripe Sub ID: null -> ${winnerStripeSub.id}`);

        if (isDryRun) {
          logger.info(`[DRY RUN] Would link ${winnerLocalSub.id} to ${winnerStripeSub.id}: ${changes.join(', ')}`);
          await hydrateSubscriptionData(winnerLocalSub, stripeSub, true);
        } else {
          await db.update(subscriptions)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(subscriptions.id, winnerLocalSub.id));

          logger.info(`Linked ${winnerLocalSub.id} to ${winnerStripeSub.id}: ${changes.join(', ')}`);
          updatedCount++;

          // Full Hydration
          await hydrateSubscriptionData(winnerLocalSub, stripeSub, false);
          updatedCount++;
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
