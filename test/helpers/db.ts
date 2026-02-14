import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/schema/index';

// Test database connection
// We create a new pool to have control over it in tests
export const testPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const testDb = drizzle(testPool, { schema });
