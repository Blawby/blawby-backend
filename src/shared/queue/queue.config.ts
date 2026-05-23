import { config } from '@/shared/config';

/**
 * Graphile Worker Task Names
 *
 * These are the task identifiers used when enqueueing jobs.
 * Task files are located in src/workers/tasks/ and src/shared/events/tasks/
 */
export const TASK_NAMES = {
  PROCESS_STRIPE_WEBHOOK: 'process-stripe-webhook',
  PROCESS_ONBOARDING_WEBHOOK: 'process-onboarding-webhook',
  PROCESS_INVOICE_PAYMENT: 'process-invoice-payment',
  PROCESS_INVOICE_VOID_RECONCILIATION: 'process-invoice-void-reconciliation',
  PROCESS_OUTBOX_EVENT: 'process-outbox-event',
  PROCESS_METERED_USAGE: 'process-metered-usage',
  PROCESS_REFUND_RECONCILIATION: 'process-refund-reconciliation',
  CLEANUP_EMAIL_LOGS: 'cleanup-email-logs',
  SEND_EMAIL: 'send-email',
} as const;

/**
 * Graphile Worker Configuration
 *
 * Job options for enqueueing jobs via Graphile Worker
 */
export const graphileWorkerConfig = {
  // Maximum retry attempts for failed jobs
  maxAttempts: config.queue.maxAttempts,
  // Worker concurrency (how many jobs to process simultaneously)
  concurrency: config.queue.concurrency,
  // Graphile Worker schema name
  schema: config.queue.schema,
} as const;
