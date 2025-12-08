#!/usr/bin/env tsx

/**
 * Sync Subscription Plans Script
 *
 * Standalone script to sync subscription plans from Stripe to database
 * Usage: pnpm run sync:plans
 */

import { config } from '@dotenvx/dotenvx';
import { syncAllPlansFromStripe } from '@/modules/subscriptions/services/syncPlans.service';

// Load environment variables
config();

/**
 * Main execution function
 */
const main = async (): Promise<void> => {
  try {
    console.log('🚀 Starting subscription plans sync...\n');

    const result = await syncAllPlansFromStripe();

    console.log('\n✅ Sync completed!');
    console.log(`   Synced: ${result.synced} plans`);
    console.log(`   Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach((error) => {
        console.log(`   - ${error.productId}: ${error.error}`);
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

