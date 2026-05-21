import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/schema/index';

type TestDb = NodePgDatabase<typeof schema> & { $client: Pool };

let _testPool: Pool | null = null;
let _testDb: TestDb | null = null;

export const getTestDb = (): TestDb => {
  if (!_testDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required for tests');
    }

    _testPool = new Pool({
      connectionString,
    });
    _testDb = drizzle(_testPool, { schema }) as TestDb;
  }
  return _testDb;
};

export const getTestPool = (): Pool => {
  if (!_testPool) {
    getTestDb(); // Ensure db and pool are initialized
  }
  return _testPool!;
};

