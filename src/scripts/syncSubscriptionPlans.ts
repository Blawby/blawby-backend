#!/usr/bin/env tsx

/**
 * Sync Subscription Plans Script
 *
 * Standalone script to sync subscription plans from Stripe to database
 * Usage: pnpm run sync:plans
 */

import { config } from '@dotenvx/dotenvx';
import syncPlansService from '@/modules/subscriptions/services/syncPlans.service';

// Load environment variables
config();

/**
 * Main execution function
 */
const main = async (): Promise<void> => {
  try {
    console.log('🚀 Starting subscription plans sync...\n');

    const result = await syncPlansService.syncAllPlansFromStripe();

    if (!result.success) {
      console.error('\n❌ Sync failed:', result.error.message);
      process.exit(1);
    }

    const { synced, errors } = result.data;

    console.log('\n✅ Sync completed!');
    console.log(`   Synced: ${synced} plans`);
    console.log(`   Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach((error: { product_id: string; error: string }) => {
        console.log(`   - ${error.product_id}: ${error.error}`);
      });
      process.exit(1);
    }

    console.log('\n✨ All plans synced successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error during sync:', error);
    process.exit(1);
  }
};

// Run the script
main();

