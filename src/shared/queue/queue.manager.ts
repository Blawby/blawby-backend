/**
 * Queue Manager - Graphile Worker Implementation
 *
 * Manages job queuing using Graphile Worker (PostgreSQL-based).
 *
 * Architecture:
 * - WorkerUtils: Used in API to ADD jobs (producer)
 * - Worker Runner: Separate process to PROCESS jobs (consumer)
 * - PostgreSQL: Job queue storage
 */

import { getLogger } from '@logtape/logtape';
import { sql } from 'drizzle-orm';
import { getWorkerUtils, closeWorkerUtils } from './graphile-worker.client';
import { TASK_NAMES, graphileWorkerConfig } from './queue.config';
import { db } from '@/shared/database';

const logger = getLogger(['queue', 'manager']);

/**
 * Add a webhook processing job to the queue
 */
const addWebhookJob = async (webhookId: string, eventId: string, eventType: string): Promise<void> => {
  const workerUtils = await getWorkerUtils();

  try {
    await workerUtils.addJob(
      TASK_NAMES.PROCESS_STRIPE_WEBHOOK,
      {
        webhookId,
        eventId,
        eventType,
      },
      {
        jobKey: eventId, // Use Stripe event ID for deduplication
        maxAttempts: graphileWorkerConfig.maxAttempts,
      }
    );

    logger.info('Webhook job queued: {eventId} ({eventType})', { eventId, eventType });
  } catch (error) {
    logger.error('Failed to queue webhook job {eventId}', { error, eventId });
    throw error;
  }
};

/**
 * Add an onboarding webhook processing job to the queue
 */
const addOnboardingWebhookJob = async (webhookId: string, eventId: string, eventType: string): Promise<void> => {
  const workerUtils = await getWorkerUtils();

  try {
    await workerUtils.addJob(
      TASK_NAMES.PROCESS_ONBOARDING_WEBHOOK,
      {
        webhookId,
        eventId,
        eventType,
      },
      {
        jobKey: eventId, // Use Stripe event ID for deduplication
        maxAttempts: graphileWorkerConfig.maxAttempts,
      }
    );

    logger.info('Onboarding webhook job queued: {eventId} ({eventType})', { eventId, eventType });
  } catch (error) {
    logger.error('Failed to queue onboarding webhook job {eventId}', { error, eventId });
    throw error;
  }
};

/**
 * Add an email job to the queue
 */
const addEmailJob = async (
  template: string,
  to: string,
  subject: string,
  data: Record<string, unknown>
): Promise<void> => {
  const workerUtils = await getWorkerUtils();

  try {
    await workerUtils.addJob(
      TASK_NAMES.SEND_EMAIL,
      {
        payload: {
          template,
          to,
          subject,
          data,
        },
      },
      {
        maxAttempts: graphileWorkerConfig.maxAttempts,
      }
    );

    logger.info('Email job queued: {template} to {to}', { template, to });
  } catch (error) {
    logger.error('Failed to queue email job', { error });
    throw error;
  }
};

export const addMeteredUsageJob = async (payload: {
  organizationId: string;
  meteredType: string;
  quantity: number;
  deduplicationId: string;
}): Promise<void> => {
  const workerUtils = await getWorkerUtils();

  try {
    await workerUtils.addJob(
      TASK_NAMES.PROCESS_METERED_USAGE,
      payload,
      {
        jobKey: `metered:${payload.organizationId}:${payload.meteredType}:${payload.deduplicationId}`,
        maxAttempts: graphileWorkerConfig.maxAttempts,
      },
    );

    logger.info('Metered usage retry job queued: {meteredType} ({deduplicationId})', {
      meteredType: payload.meteredType,
      deduplicationId: payload.deduplicationId,
      organizationId: payload.organizationId,
    });
  } catch (error) {
    logger.error('Failed to queue metered usage retry job {deduplicationId}', {
      error,
      deduplicationId: payload.deduplicationId,
      meteredType: payload.meteredType,
      organizationId: payload.organizationId,
    });
    throw error;
  }
};

export const addRefundReconciliationJob = async (payload: {
  organizationId: string;
  requestId: string;
  executorUserId: string;
  stripePaymentIntentId: string;
  stripeTransferId: string | null;
  stripeRefundId: string | null;
  refundedAmount: number;
}): Promise<void> => {
  const workerUtils = await getWorkerUtils();

  try {
    await workerUtils.addJob(
      TASK_NAMES.PROCESS_REFUND_RECONCILIATION,
      payload,
      {
        jobKey: `refund-reconcile:${payload.organizationId}:${payload.requestId}`,
        maxAttempts: graphileWorkerConfig.maxAttempts,
      },
    );

    logger.info('Refund reconciliation job queued: {requestId}', {
      requestId: payload.requestId,
      organizationId: payload.organizationId,
      stripeRefundId: payload.stripeRefundId,
    });
  } catch (error) {
    logger.error('Failed to queue refund reconciliation job {requestId}', {
      error,
      requestId: payload.requestId,
      organizationId: payload.organizationId,
    });
    throw error;
  }
};
/**
 * Get queue statistics for monitoring
 * Queries Graphile Worker's job tables directly
 */
const getQueueStats = async (
  taskName: string
): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> => {
  const { schema } = graphileWorkerConfig;

  // Query Graphile Worker's jobs table
  // Jobs are stored with their task_identifier matching the task name
  // Graphile Worker schema: jobs table with columns: attempts, locked_at, locked_by, max_attempts, task_identifier
  // Note: taskName comes from TASK_NAMES constant, so it's safe to use in raw SQL
  const schemaEscaped = schema.replace(/"/g, '""');
  const taskNameEscaped = taskName.replace(/'/g, "''");

  const stats = await db.execute(
    sql.raw(`
      SELECT
        COUNT(*) FILTER (WHERE attempts = 0 AND locked_at IS NULL) as waiting,
        COUNT(*) FILTER (WHERE locked_at IS NOT NULL AND locked_by IS NOT NULL) as active,
        COUNT(*) FILTER (WHERE attempts > 0 AND attempts < max_attempts AND locked_at IS NULL) as completed,
        COUNT(*) FILTER (WHERE attempts >= max_attempts AND locked_at IS NULL) as failed
      FROM "${schemaEscaped}".jobs
      WHERE task_identifier = '${taskNameEscaped}'
    `)
  );

  const row = stats.rows[0] as {
    waiting: string | number;
    active: string | number;
    completed: string | number;
    failed: string | number;
  };

  return {
    waiting: typeof row.waiting === 'number' ? row.waiting : Number.parseInt(String(row.waiting), 10),
    active: typeof row.active === 'number' ? row.active : Number.parseInt(String(row.active), 10),
    completed: typeof row.completed === 'number' ? row.completed : Number.parseInt(String(row.completed), 10),
    failed: typeof row.failed === 'number' ? row.failed : Number.parseInt(String(row.failed), 10),
  };
};

/**
 * Get webhook queue statistics
 */
const getWebhookQueueStats = async (): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> => getQueueStats(TASK_NAMES.PROCESS_STRIPE_WEBHOOK);

/**
 * Clean up Graphile Worker connection
 */
const closeQueues = async (): Promise<void> => {
  logger.info('Closing queue manager...');
  await closeWorkerUtils();
  logger.info('Queue manager closed');
};

// Legacy exports for backward compatibility during migration
// TODO: Remove after full migration
const getQueue = (_name: string): never => {
  throw new Error('getQueue() is deprecated. Use getWorkerUtils() and addJob() directly.');
};

const getWebhookQueue = (): never => {
  throw new Error('getWebhookQueue() is deprecated. Use queueManager.addWebhookJob() instead.');
};

const getQueueEvents = (_name: string): never => {
  throw new Error(
    'getQueueEvents() is not available in Graphile Worker. Query the jobs table directly for monitoring.'
  );
};

// Graceful shutdown handling
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, closing queue manager...');
  await closeQueues();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, closing queue manager...');
  await closeQueues();
  process.exit(0);
});

export const queueManager = {
  addWebhookJob,
  addOnboardingWebhookJob,
  addEmailJob,
  getQueueStats,
  getWebhookQueueStats,
  closeQueues,
  getQueue,
  getWebhookQueue,
  getQueueEvents,
};
