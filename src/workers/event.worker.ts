#!/usr/bin/env node
import { config } from '@dotenvx/dotenvx';
import { processOutboxEvent } from '@/shared/events/tasks/process-outbox-event';
import { TASK_NAMES } from '@/shared/queue/queue.config';
import { runWorker } from '@/shared/queue/worker-runner';
import { processOnboardingWebhook } from '@/workers/tasks/process-onboarding-webhook';
import { processStripeWebhook } from '@/workers/tasks/process-stripe-webhook';

config();

// Start the worker
void runWorker({
  name: 'Event Worker',
  taskList: {
    [TASK_NAMES.PROCESS_STRIPE_WEBHOOK]: processStripeWebhook,
    [TASK_NAMES.PROCESS_ONBOARDING_WEBHOOK]: processOnboardingWebhook,
    [TASK_NAMES.PROCESS_OUTBOX_EVENT]: processOutboxEvent,
  },
  // Run outbox processing every minute to catch any missed events
  crontab: `
    * * * * * ${TASK_NAMES.PROCESS_OUTBOX_EVENT}
  `,
});
