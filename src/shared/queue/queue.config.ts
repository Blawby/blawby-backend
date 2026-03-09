/**
 * Graphile Worker Task Names
 *
 * These are the task identifiers used when enqueueing jobs.
 * Task files are located in src/workers/tasks/ and src/shared/events/tasks/
 */
export const TASK_NAMES = {
  PROCESS_STRIPE_WEBHOOK: 'process-stripe-webhook',
  PROCESS_ONBOARDING_WEBHOOK: 'process-onboarding-webhook',
  PROCESS_OUTBOX_EVENT: 'process-outbox-event',
  PROCESS_METERED_USAGE: 'process-metered-usage',
  PROCESS_REFUND_RECONCILIATION: 'process-refund-reconciliation',
  SEND_EMAIL: 'send-email',
} as const;

/**
 * Graphile Worker Configuration
 *
 * Job options for enqueueing jobs via Graphile Worker
 */
export const graphileWorkerConfig = {
  // Maximum retry attempts for failed jobs
  maxAttempts: Number(process.env.WEBHOOK_MAX_RETRIES) || 5,
  // Worker concurrency (how many jobs to process simultaneously)
  concurrency: Number(process.env.WEBHOOK_WORKER_CONCURRENCY) || 5,
  // Graphile Worker schema name
  schema: process.env.GRAPHILE_WORKER_SCHEMA || 'graphile_worker',
} as const;
