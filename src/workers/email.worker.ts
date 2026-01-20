#!/usr/bin/env node
import { config } from '@dotenvx/dotenvx';
config();

import { TASK_NAMES } from '@/shared/queue/queue.config';
import { runWorker } from '@/shared/queue/worker-runner';
import { processEmail } from './tasks/process-email';

// Start the worker
void runWorker({
  name: 'Email Worker',
  taskList: {
    [TASK_NAMES.SEND_EMAIL]: processEmail,
  },
  concurrency: 3,
});
