/**
 * Migration Script: Initialize preferences for existing users
 *
 * This script creates preferences records with default notification settings
 * for all users who don't have a preferences row yet.
 *
 * Usage: npx tsx scripts/initialize-user-preferences.ts
 *
 * Options:
 *   --dry-run    Preview changes without applying them
 *   --verbose    Show detailed logs
 *   --batch-size Number of users to process per batch (default: 100)
 */

import { config } from '@dotenvx/dotenvx';
config();

import { db } from '../src/shared/database';
import { users } from '../src/schema/better-auth-schema';
import { preferences } from '../src/modules/preferences/schema/preferences.schema';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../src/modules/preferences/types/preferences.types';
import { eq, notInArray, sql } from 'drizzle-orm';

const parseArgs = (): { dryRun: boolean; verbose: boolean; batchSize: number } => {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
    batchSize: parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '100', 10),
  };
};

const main = async (): Promise<void> => {
  const { dryRun, verbose, batchSize } = parseArgs();

  console.log('🚀 Initializing preferences for existing users...');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be applied)'}`);
  console.log(`Batch size: ${batchSize}`);
  console.log('');

  try {
    // Get all users
    const allUsers = await db.select({ id: users.id, email: users.email }).from(users);
    console.log(`Found ${allUsers.length} total users`);

    // Get users who already have preferences
    const usersWithPreferences = await db
      .select({ userId: preferences.userId })
      .from(preferences);

    const userIdsWithPreferences = new Set(usersWithPreferences.map(p => p.userId));
    console.log(`Found ${userIdsWithPreferences.size} users with existing preferences`);

    // Find users without preferences
    const usersWithoutPreferences = allUsers.filter(user => !userIdsWithPreferences.has(user.id));
    console.log(`Found ${usersWithoutPreferences.length} users without preferences`);
    console.log('');

    if (usersWithoutPreferences.length === 0) {
      console.log('✅ All users already have preferences. Nothing to do.');
      return;
    }

    if (dryRun) {
      console.log('📋 Users that would get preferences initialized:');
      if (verbose) {
        usersWithoutPreferences.forEach(user => {
          console.log(`  - ${user.id} (${user.email || 'no email'})`);
        });
      } else {
        console.log(`  (${usersWithoutPreferences.length} users - use --verbose to see details)`);
      }
      console.log('');
      console.log('✅ Dry run complete. Run without --dry-run to apply changes.');
      return;
    }

    // Process in batches
    let processed = 0;
    let created = 0;
    let errors = 0;

    for (let i = 0; i < usersWithoutPreferences.length; i += batchSize) {
      const batch = usersWithoutPreferences.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(usersWithoutPreferences.length / batchSize);

      console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} users)...`);

      for (const user of batch) {
        try {
          await db.insert(preferences).values({
            userId: user.id,
            notifications: DEFAULT_NOTIFICATION_PREFERENCES,
            general: {},
            security: {},
            account: {},
            onboarding: {},
          });

          created++;
          if (verbose) {
            console.log(`  ✓ Created preferences for ${user.id} (${user.email || 'no email'})`);
          }
        } catch (error) {
          errors++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`  ✗ Failed to create preferences for ${user.id}: ${errorMessage}`);
          if (verbose) {
            console.error(`    Error details:`, error);
          }
        }
        processed++;
      }

      console.log(`  Batch ${batchNumber} complete: ${created} created, ${errors} errors`);
    }

    console.log('');
    console.log('📊 Summary:');
    console.log(`  Total users processed: ${processed}`);
    console.log(`  Preferences created: ${created}`);
    console.log(`  Errors: ${errors}`);
    console.log('');

    if (errors === 0) {
      console.log('✅ All preferences initialized successfully!');
    } else {
      console.log(`⚠️  Completed with ${errors} error(s). Please review the logs above.`);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
};

main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
