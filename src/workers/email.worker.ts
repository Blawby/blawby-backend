#!/usr/bin/env node
import { config } from '@dotenvx/dotenvx';
import { TASK_NAMES } from '@/shared/queue/queue.config';
import { runWorker } from '@/shared/queue/worker-runner';

// Import tasks
import { processEmail } from './tasks/process-email';

// Load environment variables
config();

// Start the worker
void runWorker({
  name: 'Email Worker',
  taskList: {
    [TASK_NAMES.SEND_EMAIL]: processEmail,
  },
  concurrency: 3,
});
