import { Client } from 'pg';
import { config } from '@dotenvx/dotenvx';
import { getLogger } from '@logtape/logtape';

// Load test environment variables so we can read POSTGRES_USER/PASSWORD
config({ path: '.env.test' });

const logger = getLogger(['test', 'global-teardown']);

export default async function globalTeardown() {
  logger.info('🧹 Cleaning up test database...');

  const testDbName = 'blawby_test';
  const client = new Client({
    host: '127.0.0.1',
    port: 5432,
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
    database: 'postgres',
  });

  try {
    await client.connect();

    // Drop test database
    logger.info(`  → Dropping ${testDbName} database...`);
    // Force disconnect other sessions to allow drop
    await client.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = '${testDbName}'
        AND pid <> pg_backend_pid();
    `);
    await client.query(`DROP DATABASE IF EXISTS ${testDbName}`);

    logger.info('✅ Test database cleanup complete!');
  } catch (error) {
    logger.error('❌ Failed to cleanup test database: {error}', { error });
    // Don't throw - allow tests to complete even if cleanup fails
  } finally {
    await client.end();
  }
}
