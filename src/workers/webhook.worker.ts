#!/usr/bin/env node

/**
 * Webhook Worker Process
 *
 * This is a separate Node.js process that consumes webhook jobs from PostgreSQL (Graphile Worker).
 * It runs independently from the API server and processes webhooks asynchronously.
 *
 * Architecture:
 * - API Server: Receives webhooks, saves to DB, enqueues jobs to PostgreSQL
 * - Worker Process: Consumes jobs from PostgreSQL, processes webhooks, marks complete
 * - PostgreSQL: Job queue storage (via Graphile Worker)
 *
 * Usage:
 * - Development: `pnpm run worker:dev` (with watch mode)
 * - Production: `pnpm run worker`
 */

import { config } from '@dotenvx/dotenvx';
import { run } from 'graphile-worker';
import { graphileWorkerConfig, TASK_NAMES } from '@/shared/queue/queue.config';

// Import tasks
import { processStripeWebhook } from './tasks/process-stripe-webhook';
import { processOnboardingWebhook } from './tasks/process-onboarding-webhook';
import { processEventHandler } from './tasks/process-event-handler';
import { processOutboxEvent } from '@/shared/events/tasks/process-outbox-event';

// Load environment variables
config();

/**
 * Graceful shutdown handling
 */
let runner: Awaited<ReturnType<typeof run>> | null = null;

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n📡 Received ${signal}, shutting down gracefully...`);

  try {
    if (runner) {
      console.log('🔌 Stopping Graphile Worker...');
      await runner.stop();
      runner = null;
      console.log('✅ Graphile Worker stopped');
    }

    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

/**
 * Start Graphile Worker
 */
async function startWorker(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const schema = graphileWorkerConfig.schema;
  const concurrency = graphileWorkerConfig.concurrency;

  // Log startup information
  const connectionInfo = connectionString.replace(/:[^:@]+@/, ':****@');
  console.log('🔧 Webhook Worker Configuration:');
  console.log(`  - Database: ${connectionInfo}`);
  console.log(`  - Schema: ${schema}`);
  console.log(`  - Tasks: ${TASK_NAMES.PROCESS_STRIPE_WEBHOOK}, ${TASK_NAMES.PROCESS_ONBOARDING_WEBHOOK}, ${TASK_NAMES.PROCESS_EVENT_HANDLER}, ${TASK_NAMES.PROCESS_OUTBOX_EVENT}`);
  console.log(`  - Concurrency: ${concurrency}`);
  console.log(`  - Max Retries: ${graphileWorkerConfig.maxAttempts}`);
  console.log('');

  // Start Graphile Worker runner
  console.log('🔌 Connecting to Graphile Worker...');

  try {
    // Define task list with explicit imports (required for TypeScript)
    const taskList = {
      [TASK_NAMES.PROCESS_STRIPE_WEBHOOK]: processStripeWebhook,
      [TASK_NAMES.PROCESS_ONBOARDING_WEBHOOK]: processOnboardingWebhook,
      [TASK_NAMES.PROCESS_EVENT_HANDLER]: processEventHandler,
      [TASK_NAMES.PROCESS_OUTBOX_EVENT]: processOutboxEvent,
    };

    runner = await run({
      connectionString,
      schema,
      taskList,
      concurrency,
      noHandleSignals: true, // We handle signals ourselves
      pollInterval: 1000, // Poll for new jobs every second
      crontab: `
        */1 * * * * ${TASK_NAMES.PROCESS_OUTBOX_EVENT}
      `, // Process outbox events every minute
    });

    console.log('✅ Graphile Worker connected and ready to process jobs');
  } catch (error) {
    console.error('❌ Graphile Worker connection error:', error);
    throw error;
  }

  // Wait for the runner to complete (runs indefinitely until stopped)
  await runner.promise;
}

// Start the worker
startWorker().catch((error) => {
  console.error('🚨 Failed to start Graphile Worker:', error);
  process.exit(1);
});
