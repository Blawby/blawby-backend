#!/usr/bin/env node
import { config } from '@dotenvx/dotenvx';
import { processOutboxEvent } from '@/shared/events/tasks/process-outbox-event';
import { TASK_NAMES } from '@/shared/queue/queue.config';
import { runWorker } from '@/shared/queue/worker-runner';
import { processMeteredUsage } from '@/workers/tasks/process-metered-usage';
import { cleanupEmailLogs } from '@/workers/tasks/cleanup-email-logs';
import { processOnboardingWebhook } from '@/workers/tasks/process-onboarding-webhook';
import { processRefundReconciliation } from '@/workers/tasks/process-refund-reconciliation';
import { processStripeWebhook } from '@/workers/tasks/process-stripe-webhook';
import { processInvoicePayment } from '@/workers/tasks/process-invoice-payment';
import { processInvoiceVoidReconciliation } from '@/workers/tasks/process-invoice-void-reconciliation';
import { seedDefaultIntakeTemplate } from '@/workers/tasks/seed-default-intake-template';

config();

// Start the worker
void runWorker({
  name: 'Event Worker',
  taskList: {
    [TASK_NAMES.PROCESS_STRIPE_WEBHOOK]: processStripeWebhook,
    [TASK_NAMES.PROCESS_ONBOARDING_WEBHOOK]: processOnboardingWebhook,
    [TASK_NAMES.PROCESS_OUTBOX_EVENT]: processOutboxEvent,
    [TASK_NAMES.PROCESS_INVOICE_PAYMENT]: processInvoicePayment,
    [TASK_NAMES.PROCESS_INVOICE_VOID_RECONCILIATION]: processInvoiceVoidReconciliation,
    [TASK_NAMES.PROCESS_METERED_USAGE]: processMeteredUsage,
    [TASK_NAMES.PROCESS_REFUND_RECONCILIATION]: processRefundReconciliation,
    [TASK_NAMES.CLEANUP_EMAIL_LOGS]: cleanupEmailLogs,
    [TASK_NAMES.SEED_DEFAULT_INTAKE_TEMPLATE]: seedDefaultIntakeTemplate,
  },
  // Run outbox processing every minute to catch any missed events
  crontab: `
    * * * * * ${TASK_NAMES.PROCESS_OUTBOX_EVENT}
    0 3 * * * ${TASK_NAMES.CLEANUP_EMAIL_LOGS}
  `,
});
