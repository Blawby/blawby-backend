#!/usr/bin/env node
import { config } from '@dotenvx/dotenvx';
import { TASK_NAMES } from '@/shared/queue/queue.config';
import { runWorker } from '@/shared/queue/worker-runner';

// Import tasks
import { processStripeWebhook } from '@/workers/tasks/process-stripe-webhook';
import { processOnboardingWebhook } from '@/workers/tasks/process-onboarding-webhook';
import { processEventHandler } from '@/workers/tasks/process-event-handler';
import { processOutboxEvent } from '@/shared/events/tasks/process-outbox-event';

// Load environment variables before anything else
config();

// Start the worker
void runWorker({
  name: 'Event Worker',
  taskList: {
    [TASK_NAMES.PROCESS_STRIPE_WEBHOOK]: processStripeWebhook,
    [TASK_NAMES.PROCESS_ONBOARDING_WEBHOOK]: processOnboardingWebhook,
    [TASK_NAMES.PROCESS_EVENT_HANDLER]: processEventHandler,
    [TASK_NAMES.PROCESS_OUTBOX_EVENT]: processOutboxEvent,
  },
});
