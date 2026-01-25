/**
 * Worker Runner Utility
 *
 * Provides a clean, standardized way to start workers while abstracting
 * away the application boot sequence and Graphile Worker boilerplate.
 *
 * Includes LISTEN/NOTIFY handler for instant event pickup (<10ms latency)
 * instead of relying solely on polling (up to 1000ms latency).
 */

import { run, TaskList } from 'graphile-worker';
import { Client } from 'pg';
import { getWorkerUtils } from './graphile-worker.client';
import { graphileWorkerConfig, TASK_NAMES } from './queue.config';
import { bootCore } from '@/boot';

interface WorkerOptions {
  name: string;
  taskList: TaskList;
  concurrency?: number;
  crontab?: string;
}

/**
 * Setup PostgreSQL LISTEN handler for instant event notification
 *
 * When an event is dispatched (critical or async), it sends NOTIFY new_events.
 * This listener picks up that notification and immediately triggers outbox processing,
 * reducing latency from up to 1000ms (polling) to <10ms.
 */
const setupEventListener = async (connectionString: string): Promise<Client> => {
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
          console.error('Failed to trigger outbox processing on NOTIFY:', error);
        }
      }
    });

    client.on('error', (err) => {
      console.error('LISTEN client error:', err);
    });

    console.log('📡 LISTEN new_events handler active (instant event pickup)');
    return client;
  } catch (error) {
    console.error('Failed to setup LISTEN handler:', error);
    throw error;
  }
};

/**
 * Run a worker with standardized boot and shutdown handling
 */
export const runWorker = async (options: WorkerOptions): Promise<void> => {
  const { name, taskList, concurrency } = options;
  // 1. Ensure the application environment is ready (Events, Services, etc.)
  // This is the "Everything should be ready" part
  bootCore();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const schema = graphileWorkerConfig.schema;
  const workerConcurrency = concurrency || graphileWorkerConfig.concurrency;

  console.log(`📡 Starting ${name}...`);
  console.log(`   - Schema: ${schema}`);
  console.log(`   - Concurrency: ${workerConcurrency}`);

  let listenClient: Client | null = null;

  try {
    // Start the Graphile Worker runner
    const runner = await run({
      connectionString,
      schema,
      taskList,
      concurrency: workerConcurrency,
      pollInterval: 1000, // Fallback polling (LISTEN/NOTIFY is primary)
      crontab: options.crontab,
    });

    console.log(`✅ ${name} is ready and processing jobs.`);

    // Setup LISTEN/NOTIFY for instant event pickup
    // This provides <10ms latency vs 1000ms polling
    listenClient = await setupEventListener(connectionString);

    // Handle graceful shutdown
    const shutdown = async (): Promise<void> => {
      console.log(`\n📴 Shutting down ${name}...`);
      if (listenClient) {
        try {
          await listenClient.end();
          console.log('   - LISTEN client closed');
        } catch (err) {
          console.error('   - Error closing LISTEN client:', err);
        }
      }
      await runner.stop();
      console.log(`   - ${name} stopped`);
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Wait for the runner
    await runner.promise;
  } catch (error) {
    console.error(`❌ ${name} failed to start:`, error);
    if (listenClient) {
      await listenClient.end().catch(() => { });
    }
    process.exit(1);
  }
};
