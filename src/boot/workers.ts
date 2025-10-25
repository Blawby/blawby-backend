/**
 * Workers Boot
 *
 * Starts background workers for processing queued jobs
 */

import { createEventListenerWorker } from '@/workers/event-listener.worker';

/**
 * Boot background workers
 * Call this function to start all background workers for processing queued jobs
 */
export const bootWorkers = (): void => {
  console.info('🚀 Starting background workers...');

  // Start event listener worker
  const eventWorker = createEventListenerWorker();

  // Set up worker event handlers
  eventWorker.on('completed', (job) => {
    console.log(`Event handler ${job.data.handlerName} completed`);
  });

  eventWorker.on('failed', (job, err) => {
    console.error(`Event handler ${job?.data?.handlerName} failed:`, err);
  });

  console.info('✅ Background workers started');
};
