#!/usr/bin/env node
import { config } from '@dotenvx/dotenvx';

import { processEmail } from '@/workers/tasks/process-email';
import { TASK_NAMES } from '@/shared/queue/queue.config';
import { runWorker } from '@/shared/queue/worker-runner';

config();

// Start the worker
void runWorker({
  name: 'Email Worker',
  taskList: {
    [TASK_NAMES.SEND_EMAIL]: processEmail,
  },
  concurrency: 3,
});
