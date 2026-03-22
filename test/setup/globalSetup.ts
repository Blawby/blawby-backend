import { config } from '@dotenvx/dotenvx';
import { execSync } from 'child_process';
import { Client } from 'pg';

// Load test environment variables from .env.test first
config({ path: '.env.test', override: true });

export default async function globalSetup() {
  console.log('🧪 Setting up test database...');

  const dbUrl = process.env.DATABASE_URL;
  const testDbName = 'blawby_test';

  // Validate DATABASE_URL exists and targets the test database
  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is required for tests');
  }

  if (!dbUrl.includes(testDbName)) {
    throw new Error(`DATABASE_URL must target the test database '${testDbName}'. Current URL: ${dbUrl}`);
  }

  // Connect to postgres database to manage test database
  const managementClient = new Client({
    host: '127.0.0.1',
    port: 5432,
    user: process.env.POSTGRES_USER ?? 'postgres',
    password: process.env.POSTGRES_PASSWORD,
    database: 'postgres',
  });

  try {
    await managementClient.connect();

    // Drop test database if exists
    console.log(`  → Dropping ${testDbName} database if exists...`);
    await managementClient.query(`DROP DATABASE IF EXISTS ${testDbName}`);

    // Create fresh test database
    console.log(`  → Creating fresh ${testDbName} database...`);
    await managementClient.query(`CREATE DATABASE ${testDbName}`);
  } finally {
    await managementClient.end();
  }

  // Use drizzle-kit push to sync schema directly (bypasses migrations)
  console.log('  → Syncing database schema...');

  try {
    execSync(`yes | DATABASE_URL="${dbUrl}" pnpm drizzle-kit push --force`, {
      stdio: 'inherit',
      shell: '/bin/bash',
    });

    console.log('✅ Test database setup complete!\n');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Failed to setup test database:', errorMessage);
    throw error;
  }
}
