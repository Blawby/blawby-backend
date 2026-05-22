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

/**
 * Get or create Graphile Worker utils singleton.
 * Used for enqueueing jobs from the API server and workers.
 */
export const getWorkerUtils = async (): Promise<WorkerUtils> => {
  if (!workerUtils) {
    const { schema } = appConfig.queue;

    workerUtils = await makeWorkerUtils({
      pgPool: getPool(),
      schema,
    });
  }

  return workerUtils;
};

/**
 * Close Graphile Worker connection.
 * Call this during graceful shutdown.
 */
export const closeWorkerUtils = async (): Promise<void> => {
  if (workerUtils) {
    await workerUtils.release();
    workerUtils = null;
  }
};
