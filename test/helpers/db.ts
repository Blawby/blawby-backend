import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/schema/index';

let _testPool: Pool | null = null;
let _testDb: ReturnType<typeof drizzle> | null = null;

export const getTestDb = (): ReturnType<typeof drizzle> => {
  if (!_testDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required for tests');
    }

    _testPool = new Pool({
      connectionString,
    });
    _testDb = drizzle(_testPool, { schema });
  }
  return _testDb;
};

export const getTestPool = (): Pool => {
  if (!_testPool) {
    getTestDb(); // Ensure db and pool are initialized
  }
  return _testPool!;
};

