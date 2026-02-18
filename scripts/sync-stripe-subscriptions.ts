import { config } from '@dotenvx/dotenvx';
config();
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { subscriptions } from '../src/schema/better-auth-schema';
import { db } from '../src/shared/database';
import { stripe } from '../src/shared/utils/stripe-client';

const logger = {
  info: (msg: string, ...args: unknown[]) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[ERROR] ${msg}`, ...args),
};

/**
 * Sync Stripe Subscriptions Script
 *
 * Two-pass approach:
 *   1. Subscriptions with a stripeSubscriptionId → retrieve directly from Stripe.
 *   2. Subscriptions without a stripeSubscriptionId but with a stripeCustomerId
 *      → list the customer's subscriptions from Stripe, match and backfill.
 *
 * Usage:
 *   npx tsx scripts/sync-stripe-subscriptions.ts [--dry-run]
 */

/** Extract period dates from a Stripe subscription response.
 *  Stripe API v2025+ moved current_period_start/end into items.data[]. */
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

        if (Object.keys(updates).length > 0) {
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

    // ─── Pass 2: Subscriptions without stripeSubscriptionId but with stripeCustomerId ─
    const withoutSubId = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          isNull(subscriptions.stripeSubscriptionId),
          isNotNull(subscriptions.stripeCustomerId),
        ),
      );

    logger.info(`Pass 2: Found ${withoutSubId.length} subscriptions missing Stripe Subscription ID (have Customer ID).`);

    for (const sub of withoutSubId) {
      if (!sub.stripeCustomerId) continue;

      try {
        // List all subscriptions for this customer in Stripe
        const customerSubs = await stripe.subscriptions.list({ customer: sub.stripeCustomerId, limit: 10 });
        const subsList = customerSubs.data;

        if (subsList.length === 0) {
          if (sub.status !== 'canceled') {
            if (isDryRun) {
              logger.info(
                `[DRY RUN] ${sub.id} (customer ${sub.stripeCustomerId}): no subscriptions found in Stripe. Would mark canceled.`,
              );
            } else {
              await db
                .update(subscriptions)
                .set({ status: 'canceled', cancelAtPeriodEnd: false, updatedAt: new Date() })
                .where(eq(subscriptions.id, sub.id));
              logger.info(`${sub.id} (customer ${sub.stripeCustomerId}): no subscriptions found. Marked canceled.`);
              updatedCount++;
            }
          } else {
            logger.info(`${sub.id} (customer ${sub.stripeCustomerId}): no subscriptions found. Already canceled.`);
          }
          continue;
        }

        // Pick the best match: prefer active/trialing, then most recent
        const stripeSub = (
          subsList.find(s => s.status === 'active' || s.status === 'trialing') ?? subsList[0]
        ) as unknown as Record<string, unknown>;

        const stripeSubId = stripeSub.id as string;
        const { updates, changes } = buildUpdates(stripeSub, sub);

        // Always backfill the stripeSubscriptionId
        updates.stripeSubscriptionId = stripeSubId;
        changes.push(`Stripe Sub ID: null -> ${stripeSubId}`);

        if (isDryRun) {
          logger.info(
            `[DRY RUN] Would update ${sub.id} (customer ${sub.stripeCustomerId}): ${changes.join(', ')}`,
          );
        } else {
          await db
            .update(subscriptions)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(subscriptions.id, sub.id));
          logger.info(`Updated ${sub.id} (customer ${sub.stripeCustomerId}): ${changes.join(', ')}`);
          updatedCount++;
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error(`Error syncing ${sub.id} (customer ${sub.stripeCustomerId}): ${errorMessage}`);
        errorCount++;
      }
    }

    logger.info(`Sync complete. Updated: ${updatedCount}, Errors: ${errorCount}`);
  } catch (error) {
    logger.error('Fatal error during sync:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
};

main().catch((err) => {
  console.error('[ERROR] Unhandled error in main:', err);
  process.exit(1);
});
