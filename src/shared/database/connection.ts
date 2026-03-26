/**
 * Independent Database Connection
 *
 * This creates a standalone database connection for use with Hono.
 * Uses lazy initialization to ensure environment variables are loaded before connecting.
 */

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from '@/schema';

const { Pool } = pg;

// Connection state
let _pool: pg.Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;
let isInitialized = false;

const DEFAULT_PG_MAX = 10;
const DEFAULT_PG_MIN = 2;
const DEFAULT_PG_IDLE_MS = 30000;
const DEFAULT_PG_CONN_TIMEOUT_MS = 2000;

/**
 * Initialize database connection (called automatically on first use)
 */
const initialize = (): void => {
  if (isInitialized) {
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  // Safe numeric parsing for pool options
  const parseEnvInt = (val: string | undefined, defaultVal: number): number => {
    if (val === undefined) {return defaultVal;}
    const parsed = Number.parseInt(val, 10);
    return Number.isFinite(parsed) ? parsed : defaultVal;
  };

  const max = parseEnvInt(process.env.PG_MAX_CLIENTS, DEFAULT_PG_MAX);
  let min = parseEnvInt(process.env.PG_MIN_CLIENTS, DEFAULT_PG_MIN);

  // Clamp min to max
  min = Math.min(min, max);

  const idleTimeoutMillis = parseEnvInt(process.env.PG_IDLE_TIMEOUT, DEFAULT_PG_IDLE_MS);
  const connectionTimeoutMillis = parseEnvInt(process.env.PG_CONNECTION_TIMEOUT, DEFAULT_PG_CONN_TIMEOUT_MS);

  _pool = new Pool({
    connectionString,
    max,
    min,
    idleTimeoutMillis,
    connectionTimeoutMillis,
  });

  _db = drizzle(_pool, { schema });
  isInitialized = true;

  console.log(`✅ Database connection initialized: ${connectionString.split('@').pop()}`);
};

/**
 * Get database instance (initializes on first call)
 */
export const getDb = (): NodePgDatabase<typeof schema> => {
  if (!isInitialized) {
    initialize();
  }
  return _db!;
};

/**
 * Get pool instance (initializes on first call)
 */
export const getPool = (): pg.Pool => {
  if (!isInitialized) {
    initialize();
  }
  return _pool!;
};

// Export db and pool as proxies that initialize on first access
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_, prop): NodePgDatabase<typeof schema>[keyof NodePgDatabase<typeof schema>] {
    return getDb()[prop as keyof NodePgDatabase<typeof schema>];
  },
});

export const pool = new Proxy({} as pg.Pool, {
  get(_, prop): pg.Pool[keyof pg.Pool] {
    return getPool()[prop as keyof pg.Pool];
  },
});

// Graceful shutdown handlers
const closeConnection = async (): Promise<void> => {
  if (_pool && isInitialized) {
    console.log('🔄 Closing database connection...');
    await _pool.end();
    console.log('✅ Database connection closed');
    isInitialized = false;
    _pool = null;
    _db = null;
  }
};

process.on('SIGINT', closeConnection);
process.on('SIGTERM', closeConnection);
