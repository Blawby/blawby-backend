/**
 * Backfill Script: Create default practice_details rows for existing organizations
 *
 * Organizations created before this fix do not have a practice_details row.
 * This script inserts a default row (using DB defaults) for each org that is missing one.
 * The org owner's user_id is used to satisfy the NOT NULL constraint.
 *
 * Usage: npx tsx scripts/backfill-practice-details.ts
 *
 * Options:
 *   --dry-run    Preview changes without applying them
 *   --verbose    Show detailed logs
 *   --batch-size Number of orgs to process per batch (default: 100)
 */

import { config } from '@dotenvx/dotenvx';
config();

import { notInArray, eq, and } from 'drizzle-orm';
import { db, pool } from '../src/shared/database';
import { organizations, members } from '../src/schema/better-auth-schema';
import { practiceDetails } from '../src/modules/practice/database/schema/practice.schema';

const parseArgs = (): { dryRun: boolean; verbose: boolean; batchSize: number } => {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
    batchSize: parseInt(args.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1] ?? '100', 10),
  };
};

const closeDbConnection = async (): Promise<void> => {
  try {
    await pool.end();
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
};

const main = async (): Promise<void> => {
  const { dryRun, verbose, batchSize } = parseArgs();

  console.log('🚀 Backfilling practice_details for existing organizations...');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be applied)'}`);
  console.log(`Batch size: ${batchSize}`);
  console.log('');

  try {
    // Find orgs that already have practice_details
    const orgsWithDetails = await db.select({ orgId: practiceDetails.organization_id }).from(practiceDetails);
    const orgIdsWithDetails = orgsWithDetails.map((r) => r.orgId);

    // Find all orgs without practice_details
    const orgsWithoutDetails =
      orgIdsWithDetails.length > 0
        ? await db
            .select({ id: organizations.id, name: organizations.name })
            .from(organizations)
            .where(notInArray(organizations.id, orgIdsWithDetails))
        : await db.select({ id: organizations.id, name: organizations.name }).from(organizations);

    console.log(`Found ${orgsWithoutDetails.length} organizations without practice_details`);
    console.log('');

    if (orgsWithoutDetails.length === 0) {
      console.log('✅ All organizations already have practice_details. Nothing to do.');
      return;
    }

    if (dryRun) {
      console.log('📋 Organizations that would get practice_details created:');
      if (verbose) {
        orgsWithoutDetails.forEach((org) => {
          console.log(`  - ${org.id} (${org.name})`);
        });
      } else {
        console.log(`  (${orgsWithoutDetails.length} orgs - use --verbose to see details)`);
      }
      console.log('');
      console.log('✅ Dry run complete. Run without --dry-run to apply changes.');
      return;
    }

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < orgsWithoutDetails.length; i += batchSize) {
      const batch = orgsWithoutDetails.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(orgsWithoutDetails.length / batchSize);

      console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} orgs)...`);

      for (const org of batch) {
        try {
          // Find the owner of the org to satisfy user_id NOT NULL
          const [owner] = await db
            .select({ userId: members.userId })
            .from(members)
            .where(and(eq(members.organizationId, org.id), eq(members.role, 'owner')))
            .limit(1);

          if (!owner) {
            console.warn(`  ⚠ No owner found for org ${org.id} (${org.name}), skipping`);
            skipped++;
            continue;
          }

          await db
            .insert(practiceDetails)
            .values({
              organization_id: org.id,
              user_id: owner.userId,
            })
            .onConflictDoNothing({ target: practiceDetails.organization_id });

          created++;
          if (verbose) {
            console.log(`  ✓ Created practice_details for ${org.id} (${org.name})`);
          }
        } catch (error) {
          errors++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`  ✗ Failed for org ${org.id} (${org.name}): ${errorMessage}`);
        }
      }
    }

    console.log('');
    console.log('📊 Summary:');
    console.log(`  Created: ${created}`);
    console.log(`  Skipped (no owner): ${skipped}`);
    console.log(`  Errors: ${errors}`);
    console.log('');

    if (errors > 0) {
      console.log('⚠️  Completed with errors. Review the output above.');
      await closeDbConnection();
      process.exit(1);
    }

    console.log('✅ Backfill complete.');
    await closeDbConnection();
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    await closeDbConnection();
    process.exit(1);
  }
};

main();
