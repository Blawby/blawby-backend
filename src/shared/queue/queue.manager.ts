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

import { sql } from 'drizzle-orm';
import { TASK_NAMES, graphileWorkerConfig } from './queue.config';
import { getWorkerUtils, closeWorkerUtils } from './graphile-worker.client';
import { db } from '@/shared/database';

/**
 * Add a webhook processing job to the queue
 */
export const addWebhookJob = async function addWebhookJob(
  webhookId: string,
  eventId: string,
  eventType: string,
): Promise<void> {
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
      },
    );

    console.log(`✅ Webhook job queued: ${eventId} (${eventType})`);
  } catch (error) {
    console.error(`❌ Failed to queue webhook job ${eventId}:`, error);
    throw error;
  }
};

/**
 * Add an onboarding webhook processing job to the queue
 */
export const addOnboardingWebhookJob = async function addOnboardingWebhookJob(
  webhookId: string,
  eventId: string,
  eventType: string,
): Promise<void> {
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
      },
    );

    console.log(`✅ Onboarding webhook job queued: ${eventId} (${eventType})`);
  } catch (error) {
    console.error(`❌ Failed to queue onboarding webhook job ${eventId}:`, error);
    throw error;
  }
};

/**
 * Get queue statistics for monitoring
 * Queries Graphile Worker's job tables directly
 */
export const getQueueStats = async function getQueueStats(
  taskName: string,
): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  const schema = graphileWorkerConfig.schema;

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
    `),
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
export const getWebhookQueueStats = async function getWebhookQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  return getQueueStats(TASK_NAMES.PROCESS_STRIPE_WEBHOOK);
};

/**
 * Clean up Graphile Worker connection
 */
export const closeQueues = async function closeQueues(): Promise<void> {
  console.log('Closing queue manager...');
  await closeWorkerUtils();
  console.log('Queue manager closed');
};

// Legacy exports for backward compatibility during migration
// TODO: Remove after full migration
export const getQueue = function getQueue(_name: string): never {
  throw new Error(
    'getQueue() is deprecated. Use getWorkerUtils() and addJob() directly.',
  );
};

export const getWebhookQueue = function getWebhookQueue(): never {
  throw new Error(
    'getWebhookQueue() is deprecated. Use addWebhookJob() directly.',
  );
};

export const getQueueEvents = function getQueueEvents(_name: string): never {
  throw new Error(
    'getQueueEvents() is not available in Graphile Worker. Query the jobs table directly for monitoring.',
  );
};

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('Received SIGINT, closing queue manager...');
  await closeQueues();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, closing queue manager...');
  await closeQueues();
  process.exit(0);
});

