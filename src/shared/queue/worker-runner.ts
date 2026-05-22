/**
 * Worker Runner Utility
 *
 * Provides a clean, standardized way to start workers while abstracting
 * away the application boot sequence and Graphile Worker boilerplate.
 *
 * Includes LISTEN/NOTIFY handler for instant event pickup (<10ms latency)
 * instead of relying solely on polling (up to 1000ms latency).
 */

import { getLogger } from '@logtape/logtape';
import { Logger as GraphileLogger, run, type TaskList } from 'graphile-worker';
import pg, { type Client as PgClient } from 'pg';
import { bootCore } from '@/boot';
import { bootServices } from '@/boot/services';
import { config } from '@/shared/config';
import { initializeLogging } from '@/shared/logging/config';
import { getWorkerUtils } from '@/shared/queue/graphile-worker.client';
import { graphileWorkerConfig, TASK_NAMES } from '@/shared/queue/queue.config';

const { Client } = pg;

const logger = getLogger(['queue', 'worker-runner']);

interface WorkerOptions {
  name: string;
  taskList: TaskList;
  concurrency?: number;
  crontab?: string;
  skipEventHandlers?: boolean;
}

/**
 * Setup PostgreSQL LISTEN handler for instant event notification
 *
 * When an event is dispatched (critical or async), it sends NOTIFY new_events.
 * This listener picks up that notification and immediately triggers outbox processing,
 * reducing latency from up to 1000ms (polling) to <10ms.
 */
const setupEventListener = async (connectionString: string): Promise<PgClient> => {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query('LISTEN new_events');

    client.on('notification', async (msg) => {
      if (msg.channel === 'new_events') {
        try {
          const utils = await getWorkerUtils();
          // Trigger immediate outbox processing (no payload = batch mode)
          await utils.addJob(TASK_NAMES.PROCESS_OUTBOX_EVENT, {});
        } catch (error) {
          logger.error('Failed to trigger outbox processing on NOTIFY: {error}', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    client.on('error', (err) => {
      logger.error('LISTEN client error: {error}', {
        error: err.message,
      });
    });

    logger.info('LISTEN new_events handler active (instant event pickup)');
    return client;
  } catch (error) {
    logger.error('Failed to setup LISTEN handler: {error}', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Close the client to avoid leaking the connection if connect() succeeded
    try {
      await client.end();
    } catch (closeError) {
      logger.error('Error closing LISTEN client after setup failure: {error}', {
        error: closeError instanceof Error ? closeError.message : String(closeError),
      });
    }
    throw error;
  }
};

/**
 * Run a worker with standardized boot and shutdown handling
 */
export const runWorker = async (options: WorkerOptions): Promise<void> => {
  const { name, taskList, concurrency } = options;

  // 0. Initialize logging system
  await initializeLogging();

  // 1. Ensure the application environment is ready (Events, Services, etc.)
  if (options.skipEventHandlers) {
    bootServices();
  } else {
    bootCore();
  }

  const connectionString = config.database.url;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const { schema } = graphileWorkerConfig;
  const workerConcurrency = concurrency ?? graphileWorkerConfig.concurrency;

  console.info(`[${name}] Starting worker with schema=${schema} concurrency=${workerConcurrency}`);
  logger.info('Starting worker {name}', { name, schema, concurrency: workerConcurrency });

  let listenClient: PgClient | null = null;

  try {
    // Start the Graphile Worker runner
    const runner = await run({
      connectionString,
      schema,
      taskList,
      concurrency: workerConcurrency,
      logger: new GraphileLogger((scope) => (level, message) => {
        const prefix = scope.label ? `[${scope.label}]` : '[graphile-worker]';
        console.log(`${prefix} ${level.toUpperCase()}: ${message}`);
      }),
      pollInterval: 1000, // Fallback polling (LISTEN/NOTIFY is primary)
      crontab: options.crontab,
    });

    console.info(`[${name}] Worker is ready and processing jobs`);
    logger.info('{name} is ready and processing jobs', { name });

    // Setup LISTEN/NOTIFY for instant event pickup (best-effort)
    // This provides <10ms latency vs 1000ms polling
    // If LISTEN fails, worker continues with polling only
    // Only enable when event handlers are active (skipEventHandlers is false)
    if (!options.skipEventHandlers) {
      try {
        listenClient = await setupEventListener(connectionString);
      } catch (listenError) {
        logger.warn('LISTEN/NOTIFY setup failed, falling back to polling only: {error}', {
          error: listenError instanceof Error ? listenError.message : String(listenError),
        });
        listenClient = null;
      }
    }

    // Handle graceful shutdown
    const shutdown = async (): Promise<void> => {
      console.info(`[${name}] Shutting down...`);
      logger.info('Shutting down {name}...', { name });
      if (listenClient) {
        try {
          await listenClient.end();
          console.info(`[${name}] LISTEN client closed`);
          logger.info('LISTEN client closed');
        } catch (err) {
          logger.error('Error closing LISTEN client: {error}', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      await runner.stop();
      console.info(`[${name}] Worker stopped`);
      logger.info('{name} stopped', { name });
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Wait for the runner
    await runner.promise;
  } catch (error) {
    logger.error('{name} failed to start: {error}', {
      name,
      error: error instanceof Error ? error.message : String(error),
    });
    if (listenClient) {
      await listenClient.end().catch(() => {});
    }
    process.exit(1);
  }
};
