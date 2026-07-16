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

import { db } from '@/shared/database';
import { e2eEmailCaptureService } from '@/shared/services/email/e2e-email-capture.service';
import type { EmailJobPayloadFor, EmailTemplateName, TemplateDataMap } from '@/shared/services/email/email.types';
import { getLogger } from '@logtape/logtape';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { closeWorkerUtils, getWorkerUtils } from './graphile-worker.client';
import { TASK_NAMES, graphileWorkerConfig } from './queue.config';

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
 *
 * Callers that can retry the same logical delivery (event listeners, service
 * retries) should pass a deterministic `idempotencyKey` so re-enqueues reuse
 * the same job and provider send. Without one, each call is a distinct send.
 */
const addEmailJob = async <T extends EmailTemplateName>(
  template: T,
  to: string,
  subject: string,
  data: TemplateDataMap[T],
  options: { idempotencyKey?: string } = {}
): Promise<void> => {
  const workerUtils = await getWorkerUtils();
  const payload: EmailJobPayloadFor<T> = {
    template,
    to,
    subject,
    data,
    idempotencyKey: options.idempotencyKey ?? randomUUID(),
  };

  try {
    await workerUtils.addJob(
      TASK_NAMES.SEND_EMAIL,
      {
        payload,
      },
      {
        jobKey: `email:${payload.idempotencyKey}`,
        maxAttempts: graphileWorkerConfig.maxAttempts,
      }
    );
    await e2eEmailCaptureService.captureQueuedEmail(payload);

    logger.info('Email job queued: {template} to {to}', { template, to });
  } catch (error) {
    logger.error('Failed to queue email job', { error });
    throw error;
  }
};

const addMeteredUsageJob = async (payload: {
  organizationId: string;
  meteredType: string;
  quantity: number;
  deduplicationId: string;
}): Promise<void> => {
  const workerUtils = await getWorkerUtils();

  try {
    await workerUtils.addJob(TASK_NAMES.PROCESS_METERED_USAGE, payload, {
      jobKey: `metered:${payload.organizationId}:${payload.meteredType}:${payload.deduplicationId}`,
      maxAttempts: graphileWorkerConfig.maxAttempts,
    });

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

const addInvoicePaymentJob = async (payload: {
  invoice_id: string;
  organization_id: string;
  stripe_invoice_id: string;
  stripe_amount_paid: number;
  stripe_amount_remaining: number;
  stripe_paid_at: string | null;
  stripe_customer_id: string | null;
  stripe_on_behalf_of: string | null;
  stripe_charge_id: string | null;
  stripe_account_id: string | null;
}): Promise<void> => {
  const workerUtils = await getWorkerUtils();

  try {
    await workerUtils.addJob(TASK_NAMES.PROCESS_INVOICE_PAYMENT, payload, {
      jobKey: `invoice-payment:${payload.organization_id}:${payload.stripe_invoice_id}`,
      maxAttempts: graphileWorkerConfig.maxAttempts,
    });

    logger.info('Invoice payment job queued: {stripeInvoiceId}', {
      stripeInvoiceId: payload.stripe_invoice_id,
      organizationId: payload.organization_id,
    });
  } catch (error) {
    logger.error('Failed to queue invoice payment job {stripeInvoiceId}', {
      error,
      stripeInvoiceId: payload.stripe_invoice_id,
      organizationId: payload.organization_id,
    });
    throw error;
  }
};

const addInvoiceVoidReconciliationJob = async (payload: {
  invoiceId: string;
  organizationId: string;
  stripeInvoiceId: string;
}): Promise<void> => {
  const workerUtils = await getWorkerUtils();

  try {
    await workerUtils.addJob(TASK_NAMES.PROCESS_INVOICE_VOID_RECONCILIATION, payload, {
      jobKey: `invoice-void-reconcile:${payload.organizationId}:${payload.stripeInvoiceId}`,
      maxAttempts: graphileWorkerConfig.maxAttempts,
    });

    logger.info('Invoice void reconciliation job queued: {stripeInvoiceId}', {
      stripeInvoiceId: payload.stripeInvoiceId,
      invoiceId: payload.invoiceId,
      organizationId: payload.organizationId,
    });
  } catch (error) {
    logger.error('Failed to queue invoice void reconciliation job {stripeInvoiceId}', {
      error,
      stripeInvoiceId: payload.stripeInvoiceId,
      invoiceId: payload.invoiceId,
      organizationId: payload.organizationId,
    });
    throw error;
  }
};

const addSeedDefaultIntakeTemplateJob = async (organizationId: string): Promise<void> => {
  const workerUtils = await getWorkerUtils();

  try {
    await workerUtils.addJob(
      TASK_NAMES.SEED_DEFAULT_INTAKE_TEMPLATE,
      { organization_id: organizationId },
      {
        jobKey: `seed-intake-template:${organizationId}`,
        maxAttempts: graphileWorkerConfig.maxAttempts,
      }
    );

    logger.info('Seed default intake template job queued for {organizationId}', { organizationId });
  } catch (error) {
    logger.error('Failed to queue seed default intake template job for {organizationId}', { error, organizationId });
    throw error;
  }
};

const addRefundReconciliationJob = async (payload: {
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
    await workerUtils.addJob(TASK_NAMES.PROCESS_REFUND_RECONCILIATION, payload, {
      jobKey: `refund-reconcile:${payload.organizationId}:${payload.requestId}`,
      maxAttempts: graphileWorkerConfig.maxAttempts,
    });

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

  const row: Record<string, unknown> = stats.rows[0] ?? {};
  const toCount = (value: unknown): number => {
    if (typeof value === 'number') {
      return value;
    }
    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  return {
    waiting: toCount(row.waiting),
    active: toCount(row.active),
    completed: toCount(row.completed),
    failed: toCount(row.failed),
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

const queueManager = {
  addWebhookJob,
  addOnboardingWebhookJob,
  addEmailJob,
  getQueueStats,
  getWebhookQueueStats,
  closeQueues,
};

export {
  addInvoicePaymentJob,
  addInvoiceVoidReconciliationJob,
  addMeteredUsageJob,
  addRefundReconciliationJob,
  addSeedDefaultIntakeTemplateJob,
  queueManager,
};
