import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
});

try {
  await migrate(drizzle(pool), {
    migrationsFolder: './src/shared/database/migrations',
  });
  console.log('Database migrations applied successfully');
} catch (error) {
  console.error('Database migration failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
