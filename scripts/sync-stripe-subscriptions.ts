import { config } from '@dotenvx/dotenvx';
config();
import { eq, isNotNull } from 'drizzle-orm';
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
 * This script fetches all local subscriptions that have a Stripe Subscription ID,
 * queries Stripe for their current status, and updates the local database if there are discrepancies.
 *
 * Usage:
 *   npx tsx scripts/sync-stripe-subscriptions.ts [--dry-run]
 */
const main = async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  logger.info(`Starting Stripe subscription sync... ${isDryRun ? '(DRY RUN)' : ''}`);

  try {
    // Fetch all subscriptions with a stripe_subscription_id
    const localSubscriptions = await db
      .select()
      .from(subscriptions)
      .where(isNotNull(subscriptions.stripeSubscriptionId));

    logger.info(`Found ${localSubscriptions.length} subscriptions with Stripe IDs.`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const sub of localSubscriptions) {
      if (!sub.stripeSubscriptionId) continue;

      try {
        // The Stripe SDK v20 returns Response<Subscription> which wraps the raw object.
        // Use record access to bypass strict typing for fields like current_period_start.
        const stripeResponse = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
        const stripeSub = stripeResponse as unknown as Record<string, unknown>;

        // Stripe API v2025+ moved current_period_start/end from top-level into items.data[].
        // Read from the first item as a primary source, with top-level fallback.
        const items = stripeSub.items as Record<string, unknown> | undefined;
        const itemsData = (items?.data as Array<Record<string, unknown>>) ?? [];
        const firstItem = itemsData[0];

        const periodStart = firstItem?.current_period_start ?? stripeSub.current_period_start;
        const periodEnd = firstItem?.current_period_end ?? stripeSub.current_period_end;

        const updates: Partial<typeof subscriptions.$inferInsert> = {};
        const changes: string[] = [];

        // Check Status
        if (stripeSub.status !== sub.status) {
          updates.status = stripeSub.status as string;
          changes.push(`Status: ${sub.status} -> ${stripeSub.status}`);
        }

        // Check Period Start
        if (typeof periodStart === 'number') {
          const stripePeriodStart = new Date(periodStart * 1000);
          if (stripePeriodStart.getTime() !== sub.periodStart?.getTime()) {
            updates.periodStart = stripePeriodStart;
            changes.push(`Period Start: ${sub.periodStart?.toISOString()} -> ${stripePeriodStart.toISOString()}`);
          }
        }

        // Check Period End
        if (typeof periodEnd === 'number') {
          const stripePeriodEnd = new Date(periodEnd * 1000);
          if (stripePeriodEnd.getTime() !== sub.periodEnd?.getTime()) {
            updates.periodEnd = stripePeriodEnd;
            changes.push(`Period End: ${sub.periodEnd?.toISOString()} -> ${stripePeriodEnd.toISOString()}`);
          }
        }

        // Check Cancel At Period End
        if (typeof stripeSub.cancel_at_period_end === 'boolean' && stripeSub.cancel_at_period_end !== sub.cancelAtPeriodEnd) {
          updates.cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
          changes.push(`Cancel At Period End: ${sub.cancelAtPeriodEnd} -> ${stripeSub.cancel_at_period_end}`);
        }

        if (Object.keys(updates).length > 0) {
          if (isDryRun) {
            logger.info(
              `[DRY RUN] Would update subscription ${sub.id} (${sub.stripeSubscriptionId}): ${changes.join(', ')}`,
            );
          } else {
            await db
              .update(subscriptions)
              .set({
                ...updates,
                updatedAt: new Date(),
              })
              .where(eq(subscriptions.id, sub.id));
            logger.info(`Updated subscription ${sub.id} (${sub.stripeSubscriptionId}): ${changes.join(', ')}`);
            updatedCount++;
          }
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        // Handle missing subscription in Stripe
        const isMissing =
          (typeof err === 'object' && err !== null && 'code' in err &&
            (err as Record<string, unknown>).code === 'resource_missing') ||
          errorMessage.includes('No such subscription');

        if (isMissing) {
          if (sub.status !== 'canceled') {
            const updates: Partial<typeof subscriptions.$inferInsert> = {
              status: 'canceled',
              cancelAtPeriodEnd: false,
              updatedAt: new Date(),
            };

            if (isDryRun) {
              logger.info(
                `[DRY RUN] Subscription ${sub.id} (${sub.stripeSubscriptionId}) not found in Stripe. Would mark as canceled.`,
              );
            } else {
              await db
                .update(subscriptions)
                .set(updates)
                .where(eq(subscriptions.id, sub.id));
              logger.info(
                `Subscription ${sub.id} (${sub.stripeSubscriptionId}) not found in Stripe. Marked as canceled.`,
              );
              updatedCount++;
            }
          } else {
            logger.info(
              `Subscription ${sub.id} (${sub.stripeSubscriptionId}) not found in Stripe. Already canceled locally.`,
            );
          }
        } else {
          logger.error(`Error syncing subscription ${sub.id} (${sub.stripeSubscriptionId}): ${errorMessage}`);
          errorCount++;
        }
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
