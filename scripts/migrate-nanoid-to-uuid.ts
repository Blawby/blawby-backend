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

// Check if table exists
const tableExists = async (tableName: string): Promise<boolean> => {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = ${tableName}
    ) as exists
  `);
  return result.rows[0]?.exists === true;
};

// Check if column exists
const columnExists = async (tableName: string, columnName: string): Promise<boolean> => {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_name = ${tableName} AND column_name = ${columnName}
    ) as exists
  `);
  return result.rows[0]?.exists === true;
};

// Get all non-UUID values from a column
const getNonUuidValues = async (tableName: string, columnName: string): Promise<string[]> => {
  const result = await db.execute(sql.raw(`
    SELECT DISTINCT "${columnName}" as id
    FROM "${tableName}"
    WHERE "${columnName}" IS NOT NULL
      AND "${columnName}" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  `));
  return (result.rows as Array<{ id: string }>).map(row => row.id);
};

// Build mappings for all primary tables first
const buildMappings = async (): Promise<void> => {
  const primaryTables = [
    { table: 'users', column: 'id' },
    { table: 'organizations', column: 'id' },
    { table: 'sessions', column: 'id' },
    { table: 'accounts', column: 'id' },
    { table: 'verifications', column: 'id' },
    { table: 'members', column: 'id' },
    { table: 'invitations', column: 'id' },
    { table: 'subscriptions', column: 'id' },
  ];

  for (const { table, column } of primaryTables) {
    if (!(await tableExists(table))) continue;
    if (!(await columnExists(table, column))) continue;

    const nonUuidValues = await getNonUuidValues(table, column);
    if (nonUuidValues.length > 0) {
      idMappings[table] = new Map();
      for (const oldId of nonUuidValues) {
        const newId = nanoidToUUID(oldId);
        idMappings[table].set(oldId, newId);
      }
      log(`  📝 Built mapping for ${table}: ${nonUuidValues.length} IDs`);
    }
  }
};

// Update a column value
const updateColumn = async (
  tableName: string,
  columnName: string,
  oldValue: string,
  newValue: string,
  dryRun: boolean,
): Promise<void> => {
  if (!dryRun) {
    await db.execute(sql.raw(`
      UPDATE "${tableName}"
      SET "${columnName}" = '${newValue}'
      WHERE "${columnName}" = '${oldValue}'
    `));
  }
};

const main = async (): Promise<void> => {
  const { dryRun, verbose } = parseArgs();

  console.log('🚀 Starting nanoid to UUID migration');
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`   Verbose: ${verbose ? 'ON' : 'OFF'}`);
  console.log('');

  let totalMigrated = 0;

  try {
    // Step 1: Disable foreign key constraints
    if (!dryRun) {
      console.log('🔓 Disabling foreign key constraints...');
      await db.execute(sql`SET session_replication_role = 'replica'`);
    }

    // Step 2: Build all mappings first
    console.log('\n📋 Building ID mappings...');
    await buildMappings();

    // Step 3: Update primary keys first
    console.log('\n🔑 Updating primary keys...');
    for (const [tableName, mapping] of Object.entries(idMappings)) {
      if (mapping.size === 0) continue;

      log(`  Processing ${tableName}.id...`);
      for (const [oldId, newId] of mapping) {
        log(`    ${oldId} -> ${newId}`, true);
        await updateColumn(tableName, 'id', oldId, newId, dryRun);
        totalMigrated++;
      }
      log(`  ✅ Updated ${mapping.size} primary keys in ${tableName}`);
    }

    // Step 4: Update all foreign keys
    console.log('\n🔗 Updating foreign keys...');

    const foreignKeyUpdates = [
      // users references
      { table: 'sessions', column: 'user_id', refTable: 'users' },
      { table: 'accounts', column: 'user_id', refTable: 'users' },
      { table: 'members', column: 'user_id', refTable: 'users' },
      { table: 'invitations', column: 'inviter_id', refTable: 'users' },
      { table: 'preferences', column: 'user_id', refTable: 'users' },
      { table: 'customer_details', column: 'user_id', refTable: 'users' },
      { table: 'practice_details', column: 'user_id', refTable: 'users' },
      { table: 'event_subscriptions', column: 'user_id', refTable: 'users' },

      // organizations references
      { table: 'sessions', column: 'active_organization_id', refTable: 'organizations' },
      { table: 'members', column: 'organization_id', refTable: 'organizations' },
      { table: 'invitations', column: 'organization_id', refTable: 'organizations' },
      { table: 'practice_details', column: 'organization_id', refTable: 'organizations' },
      { table: 'practice_client_intakes', column: 'organization_id', refTable: 'organizations' },
      { table: 'payment_links', column: 'organization_id', refTable: 'organizations' },
      { table: 'stripe_connected_accounts', column: 'organization_id', refTable: 'organizations' },
      { table: 'events', column: 'organization_id', refTable: 'organizations' },

      // subscriptions references
      { table: 'organizations', column: 'active_subscription_id', refTable: 'subscriptions' },
    ];

    for (const { table, column, refTable } of foreignKeyUpdates) {
      if (!(await tableExists(table))) {
        log(`  ⏭️  Table ${table} does not exist, skipping`, true);
        continue;
      }
      if (!(await columnExists(table, column))) {
        log(`  ⏭️  Column ${table}.${column} does not exist, skipping`, true);
        continue;
      }

      const refMapping = idMappings[refTable];
      if (!refMapping || refMapping.size === 0) {
        log(`  ⏭️  No mappings for ${refTable}, skipping ${table}.${column}`, true);
        continue;
      }

      const nonUuidValues = await getNonUuidValues(table, column);
      if (nonUuidValues.length === 0) {
        log(`  ✅ ${table}.${column} - already valid UUIDs`);
        continue;
      }

      log(`  Processing ${table}.${column}...`);
      let updated = 0;
      for (const oldId of nonUuidValues) {
        const newId = refMapping.get(oldId);
        if (newId) {
          log(`    ${oldId} -> ${newId}`, true);
          await updateColumn(table, column, oldId, newId, dryRun);
          updated++;
          totalMigrated++;
        } else {
          log(`    ⚠️  No mapping for ${oldId}`, true);
        }
      }
      log(`  ✅ Updated ${updated}/${nonUuidValues.length} foreign keys in ${table}.${column}`);
    }

    // Step 5: Re-enable foreign key constraints
    if (!dryRun) {
      console.log('\n🔒 Re-enabling foreign key constraints...');
      await db.execute(sql`SET session_replication_role = 'origin'`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary');
    console.log('='.repeat(50));
    console.log(`   Total values migrated: ${totalMigrated}`);
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

    if (dryRun && totalMigrated > 0) {
      console.log('\n⚠️  Run without --dry-run to apply changes');
    }

    if (!dryRun && totalMigrated > 0) {
      console.log('\n✅ Migration completed successfully!');
      console.log('   You can now run the schema migration:');
      console.log('   pnpm drizzle-kit migrate');
    }

    if (totalMigrated === 0) {
      console.log('\n✅ No migration needed - all IDs are already valid UUIDs');
    }
  } catch (error) {
    // Make sure to re-enable FK constraints on error
    if (!dryRun) {
      try {
        await db.execute(sql`SET session_replication_role = 'origin'`);
      } catch {
        // Ignore error in cleanup
      }
    }
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }

  process.exit(0);
};

main();
