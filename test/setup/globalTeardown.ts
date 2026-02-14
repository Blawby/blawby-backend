import pg from 'pg';
import { config } from '@dotenvx/dotenvx';

// Load test environment variables so we can read POSTGRES_USER/PASSWORD
config({ path: '.env.test' });

export default async function globalTeardown() {
  console.log('\n🧹 Cleaning up test database...');

  const testDbName = 'blawby_test';
  const { Client } = pg;
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
    console.log(`  → Dropping ${testDbName} database...`);
    // Force disconnect other sessions to allow drop
    await client.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = '${testDbName}'
        AND pid <> pg_backend_pid();
    `);
    await client.query(`DROP DATABASE IF EXISTS ${testDbName}`);

    await client.end();
    console.log('✅ Test database cleanup complete!');
  } catch (error) {
    console.error('❌ Failed to cleanup test database:', error);
    // Don't throw - allow tests to complete even if cleanup fails
  }
}
