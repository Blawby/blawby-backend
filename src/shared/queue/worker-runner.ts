/**
 * Worker Runner Utility
 *
 * Provides a clean, standardized way to start workers while abstracting
 * away the application boot sequence and Graphile Worker boilerplate.
 */

import { run, TaskList } from 'graphile-worker';
import { bootCore } from '@/boot';
import { graphileWorkerConfig } from './queue.config';

interface WorkerOptions {
  name: string;
  taskList: TaskList;
  concurrency?: number;
  crontab?: string;
}

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

  try {
    const runner = await run({
      connectionString,
      schema,
      taskList,
      concurrency: workerConcurrency,
      pollInterval: 1000,
      crontab: options.crontab,
    });

    console.log(`✅ ${name} is ready and processing jobs.`);

    // Wait for the runner
    await runner.promise;
  } catch (error) {
    console.error(`❌ ${name} failed to start:`, error);
    process.exit(1);
  }
};
