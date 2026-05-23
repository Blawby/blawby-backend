/**
 * Independent Database Connection
 *
 * This creates a standalone database connection for use with Hono.
 * Uses lazy initialization to ensure environment variables are loaded before connecting.
 */

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getLogger } from '@logtape/logtape';
import pg from 'pg';

import * as schema from '@/schema';
import { config } from '@/shared/config';

const { Pool } = pg;
const logger = getLogger(['app', 'database', 'connection']);

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

  const connectionString = config.database.url;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  const max = config.database.pool.maxClients ?? DEFAULT_PG_MAX;
  let min = config.database.pool.minClients ?? DEFAULT_PG_MIN;

  // Clamp min to max
  min = Math.min(min, max);

  const idleTimeoutMillis = config.database.pool.idleTimeoutMs ?? DEFAULT_PG_IDLE_MS;
  const connectionTimeoutMillis = config.database.pool.connectionTimeoutMs ?? DEFAULT_PG_CONN_TIMEOUT_MS;
  const ssl =
    process.env.NODE_ENV === 'production'
      ? {
          // TODO: rejectUnauthorized disabled for Railway self-signed cert — replace with PlanetScale or proper CA cert
          rejectUnauthorized: false,
          ...(config.database.ssl?.ca ? { ca: config.database.ssl.ca } : {}),
        }
      : false;

  _pool = new Pool({
    connectionString,
    ssl,
    max,
    min,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    keepAlive: true,
    keepAliveInitialDelayMillis: 0,
  });

  _pool.on('error', (err) => {
    logger.error('PostgreSQL pool error: {error}', { error: err.message });
  });

  _db = drizzle(_pool, { schema });
  isInitialized = true;

  logger.info('Database connection initialized', {
    host: connectionString.split('@').pop(),
  });
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
    logger.info('Closing database connection...');
    try {
      await _pool.end();
      logger.debug('Database connection closed');
    } catch (error) {
      logger.error('Failed to close database connection: {error}', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      isInitialized = false;
      _pool = null;
      _db = null;
    }
  }
};

process.on('SIGINT', closeConnection);
process.on('SIGTERM', closeConnection);
