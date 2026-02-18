import { config } from '@dotenvx/dotenvx';
import { execSync } from 'child_process';
import { Client } from 'pg';

// Load test environment variables from .env.test first
config({ path: '.env.test' });

export default async function globalSetup() {
  console.log('🧪 Setting up test database...');

  const dbUrl = process.env.DATABASE_URL!;
  const testDbName = 'blawby_test';

  // Connect to postgres database to manage test database
  const client = new Client({
    host: '127.0.0.1',
    port: 5432,
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
    database: 'postgres',
  });

  try {
    await client.connect();

    // Drop test database if exists
    console.log(`  → Dropping ${testDbName} database if exists...`);
    await client.query(`DROP DATABASE IF EXISTS ${testDbName}`);

    // Create fresh test database
    console.log(`  → Creating fresh ${testDbName} database...`);
    await client.query(`CREATE DATABASE ${testDbName}`);

    await client.end();

    // Run Drizzle migrations
    console.log('  → Running Drizzle migrations...');
    // We need to pass the specific database URL for the migration
    execSync('pnpm drizzle-kit migrate', {
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'inherit',
    });

    console.log('✅ Test database setup complete!\n');
  } catch (error) {
    console.error('❌ Failed to setup test database:', error);
    throw error;
  }
}
