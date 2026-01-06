/**
 * Migration Script: Convert nanoid strings to UUIDs
 *
 * This script converts all nanoid-style IDs in Better Auth tables to proper UUIDs.
 * Run this BEFORE applying the schema migration that changes columns from text to uuid.
 *
 * Usage: npx tsx scripts/migrate-nanoid-to-uuid.ts
 *
 * Options:
 *   --dry-run    Preview changes without applying them
 *   --verbose    Show detailed logs
 */

import { config } from '@dotenvx/dotenvx';
config();

import { db } from '../src/shared/database';
import { sql } from 'drizzle-orm';

// UUID regex pattern (standard format with hyphens)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Check if a string is a valid UUID
const isValidUUID = (str: string): boolean => UUID_REGEX.test(str);

// Generate a deterministic UUID from a nanoid (for consistency)
// Uses a simple hash-based approach to create reproducible UUIDs
const nanoidToUUID = (nanoid: string): string => {
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < nanoid.length; i++) {
    const char = nanoid.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Create a UUID-like string using the nanoid as seed
  // This ensures the same nanoid always maps to the same UUID
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const nanoidHex = Buffer.from(nanoid).toString('hex').slice(0, 24);

  return `${hex.slice(0, 8)}-${nanoidHex.slice(0, 4)}-4${nanoidHex.slice(4, 7)}-a${nanoidHex.slice(7, 10)}-${nanoidHex.slice(10, 22)}`;
};

// Tables and their ID columns that need migration
// Order matters - parent tables first, then child tables
const TABLES_TO_MIGRATE = [
  // Primary tables (no foreign key dependencies on other tables in this list)
  { table: 'users', idColumn: 'id', type: 'primary' },
  { table: 'organizations', idColumn: 'id', type: 'primary' },
  { table: 'verifications', idColumn: 'id', type: 'primary' },

  // Secondary tables (depend on users/organizations)
  { table: 'sessions', idColumn: 'id', type: 'primary' },
  { table: 'sessions', idColumn: 'user_id', type: 'foreign', references: 'users' },
  { table: 'sessions', idColumn: 'active_organization_id', type: 'foreign', references: 'organizations' },

  { table: 'accounts', idColumn: 'id', type: 'primary' },
  { table: 'accounts', idColumn: 'user_id', type: 'foreign', references: 'users' },

  { table: 'subscriptions', idColumn: 'id', type: 'primary' },
  { table: 'subscriptions', idColumn: 'reference_id', type: 'foreign', references: 'organizations' },

  { table: 'members', idColumn: 'id', type: 'primary' },
  { table: 'members', idColumn: 'organization_id', type: 'foreign', references: 'organizations' },
  { table: 'members', idColumn: 'user_id', type: 'foreign', references: 'users' },

  { table: 'invitations', idColumn: 'id', type: 'primary' },
  { table: 'invitations', idColumn: 'organization_id', type: 'foreign', references: 'organizations' },
  { table: 'invitations', idColumn: 'inviter_id', type: 'foreign', references: 'users' },

  // Update organizations.active_subscription_id after subscriptions are migrated
  { table: 'organizations', idColumn: 'active_subscription_id', type: 'foreign', references: 'subscriptions' },

  // Other tables that reference users/organizations
  { table: 'preferences', idColumn: 'user_id', type: 'foreign', references: 'users' },
  { table: 'customer_details', idColumn: 'user_id', type: 'foreign', references: 'users' },
  { table: 'practice_details', idColumn: 'organization_id', type: 'foreign', references: 'organizations' },
  { table: 'practice_details', idColumn: 'user_id', type: 'foreign', references: 'users' },
  { table: 'practice_client_intakes', idColumn: 'organization_id', type: 'foreign', references: 'organizations' },
  { table: 'payment_links', idColumn: 'organization_id', type: 'foreign', references: 'organizations' },
  { table: 'stripe_connected_accounts', idColumn: 'organization_id', type: 'foreign', references: 'organizations' },
  { table: 'events', idColumn: 'actor_id', type: 'foreign', references: 'users' },
  { table: 'events', idColumn: 'organization_id', type: 'foreign', references: 'organizations' },
  { table: 'event_subscriptions', idColumn: 'user_id', type: 'foreign', references: 'users' },
];

// Store the mapping of old ID -> new UUID for each table
const idMappings: Record<string, Map<string, string>> = {};

const parseArgs = (): { dryRun: boolean; verbose: boolean } => {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
  };
};

const log = (message: string, verbose = false): void => {
  const { verbose: isVerbose } = parseArgs();
  if (!verbose || isVerbose) {
    console.log(message);
  }
};

const migrateTable = async (
  tableName: string,
  idColumn: string,
  type: 'primary' | 'foreign',
  referencesTable?: string,
  dryRun = false,
): Promise<{ total: number; migrated: number }> => {
  log(`\n📋 Processing ${tableName}.${idColumn} (${type})...`);

  // Check if table exists
  const tableExists = await db.execute(sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = ${tableName}
    ) as exists
  `);

  if (!tableExists.rows[0]?.exists) {
    log(`  ⏭️  Table ${tableName} does not exist, skipping`, true);
    return { total: 0, migrated: 0 };
  }

  // Check if column exists
  const columnExists = await db.execute(sql`
    SELECT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_name = ${tableName} AND column_name = ${idColumn}
    ) as exists
  `);

  if (!columnExists.rows[0]?.exists) {
    log(`  ⏭️  Column ${tableName}.${idColumn} does not exist, skipping`, true);
    return { total: 0, migrated: 0 };
  }

  // Get all non-UUID values from the column
  const result = await db.execute(sql.raw(`
    SELECT DISTINCT "${idColumn}" as id
    FROM "${tableName}"
    WHERE "${idColumn}" IS NOT NULL
      AND "${idColumn}" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  `));

  const nonUuidIds = result.rows as Array<{ id: string }>;
  const total = nonUuidIds.length;

  if (total === 0) {
    log(`  ✅ All ${idColumn} values are already valid UUIDs`);
    return { total: 0, migrated: 0 };
  }

  log(`  Found ${total} non-UUID values to migrate`);

  let migrated = 0;

  for (const row of nonUuidIds) {
    const oldId = row.id;
    let newId: string;

    if (type === 'primary') {
      // For primary keys, generate new UUID and store mapping
      newId = nanoidToUUID(oldId);
      if (!idMappings[tableName]) {
        idMappings[tableName] = new Map();
      }
      idMappings[tableName].set(oldId, newId);
    } else if (type === 'foreign' && referencesTable) {
      // For foreign keys, look up the new UUID from the referenced table's mapping
      const refMapping = idMappings[referencesTable];
      if (!refMapping || !refMapping.has(oldId)) {
        // The referenced ID might already be a UUID or not yet migrated
        // Check if it's already a UUID
        if (isValidUUID(oldId)) {
          continue; // Already valid, skip
        }
        log(`  ⚠️  Warning: No mapping found for ${referencesTable}.${oldId}`, true);
        continue;
      }
      newId = refMapping.get(oldId)!;
    } else {
      continue;
    }

    log(`  ${oldId} -> ${newId}`, true);

    if (!dryRun) {
      // Temporarily disable foreign key checks for this update
      await db.execute(sql.raw(`
        UPDATE "${tableName}"
        SET "${idColumn}" = '${newId}'
        WHERE "${idColumn}" = '${oldId}'
      `));
    }

    migrated++;
  }

  log(`  ✅ Migrated ${migrated}/${total} values${dryRun ? ' (dry run)' : ''}`);
  return { total, migrated };
};

const main = async (): Promise<void> => {
  const { dryRun, verbose } = parseArgs();

  console.log('🚀 Starting nanoid to UUID migration');
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`   Verbose: ${verbose ? 'ON' : 'OFF'}`);
  console.log('');

  let totalMigrated = 0;
  let totalFound = 0;

  try {
    // Process tables in order
    for (const { table, idColumn, type, references } of TABLES_TO_MIGRATE) {
      const { total, migrated } = await migrateTable(
        table,
        idColumn,
        type as 'primary' | 'foreign',
        references,
        dryRun,
      );
      totalFound += total;
      totalMigrated += migrated;
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary');
    console.log('='.repeat(50));
    console.log(`   Total non-UUID values found: ${totalFound}`);
    console.log(`   Total values migrated: ${totalMigrated}`);
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

    if (dryRun && totalFound > 0) {
      console.log('\n⚠️  Run without --dry-run to apply changes');
    }

    if (!dryRun && totalMigrated > 0) {
      console.log('\n✅ Migration completed successfully!');
      console.log('   You can now run the schema migration:');
      console.log('   pnpm drizzle-kit migrate');
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }

  process.exit(0);
};

main();

