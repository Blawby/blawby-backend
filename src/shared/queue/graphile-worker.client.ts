/**
 * Graphile Worker Client
 *
 * Provides singleton access to Graphile Worker utilities for enqueueing jobs.
 * Shares the Drizzle pg.Pool to avoid a redundant connection pool per process.
 */

import { makeWorkerUtils, type WorkerUtils } from 'graphile-worker';
import { config } from '@dotenvx/dotenvx';
import { config as appConfig } from '@/shared/config';
import { getPool } from '@/shared/database/connection';

// Load environment variables
config();

let workerUtils: WorkerUtils | null = null;
let workerUtilsPromise: Promise<WorkerUtils> | null = null;

/**
 * Get or create Graphile Worker utils singleton.
 * Used for enqueueing jobs from the API server and workers.
 */
export const getWorkerUtils = async (): Promise<WorkerUtils> => {
  if (workerUtils) return workerUtils;

  if (!workerUtilsPromise) {
    const { schema } = appConfig.queue;
    const connectionInfo = appConfig.database.url?.replace(/:[^:@]+@/, ':****@') ?? 'pgPool';

    console.info('🔌 Connecting to Graphile Worker...');
    console.info(`   Database: ${connectionInfo}`);
    console.info(`   Schema: ${schema}`);

    workerUtilsPromise = makeWorkerUtils({ pgPool: getPool(), schema }).then(
      (utils) => {
        workerUtils = utils;
        console.info('✅ Graphile Worker connected and ready');
        return utils;
      },
      (err: unknown) => {
        workerUtilsPromise = null;
        console.error('❌ Graphile Worker connection error:', err);
        throw err;
      }
    );
  }

  return workerUtilsPromise;
};

/**
 * Close Graphile Worker connection.
 * Call this during graceful shutdown.
 */
export const closeWorkerUtils = async (): Promise<void> => {
  const pending = workerUtilsPromise;
  workerUtils = null;
  workerUtilsPromise = null;

  if (pending) {
    console.info('🔌 Closing Graphile Worker connection...');
    const utils = await pending.catch(() => null);
    await utils?.release();
    console.info('✅ Graphile Worker connection closed');
  }
};
