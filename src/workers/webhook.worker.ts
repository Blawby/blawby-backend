#!/usr/bin/env node

/**
 * Webhook Worker Process
 *
 * This is a separate Node.js process that consumes webhook jobs from the Redis queue.
 * It runs independently from the API server and processes webhooks asynchronously.
 *
 * Architecture:
 * - API Server: Receives webhooks, saves to DB, adds jobs to queue
 * - Worker Process: Consumes jobs from queue, processes webhooks, marks complete
 * - Redis: Message broker connecting them
 *
 * Usage:
 * - Development: `pnpm run worker:dev` (with watch mode)
 * - Production: `pnpm run worker`
 */

import { config } from '@dotenvx/dotenvx';
import { Worker } from 'bullmq';

import type Stripe from 'stripe';

import { processEvent as processOnboardingEvent } from '@/modules/onboarding/services/onboarding-webhooks.service';
import {
  processSubscriptionWebhookEvent,
  isSubscriptionWebhookEvent,
} from '@/modules/subscriptions/services/subscriptionWebhooks.service';
// import { processStripeWebhookEvent } from '@/modules/stripe/services/stripe-webhook-processor.service';
import { QUEUE_NAMES } from '@/shared/queue/queue.config';
import { getRedisConnection } from '@/shared/queue/redis.client';

// Import webhook processing services
import {
  findWebhookById,
  existsByStripeEventId,
  markWebhookProcessed,
  markWebhookFailed,
} from '@/shared/repositories/stripe.webhook-events.repository';

// Load environment variables
config();

/**
 * Job processing function for Stripe webhooks
 */
async function processStripeWebhookJob(job: {
  data: {
    webhookId: string;
    eventId: string;
    eventType: string;
  };
}): Promise<void> {
  const { webhookId, eventId, eventType } = job.data;
  const startTime = Date.now();

  console.log(
    `🚀 Starting Stripe webhook job: ${eventId} (${eventType}) - Job ID: ${webhookId}`,
  );

  try {
    // Get webhook event from database
    const webhookEvent = await findWebhookById(webhookId);

    if (!webhookEvent) {
      console.error(`Webhook event not found: ${webhookId}`);
      return;
    }

    if (webhookEvent.processed) {
      console.info(`Webhook event already processed: ${eventId}`);
      return;
    }

    const event = webhookEvent.payload as Stripe.Event;

    // Route to appropriate handler based on event type
    if (isSubscriptionWebhookEvent(event.type)) {
      // Handle subscription-related events (product.*, price.*)
      await processSubscriptionWebhookEvent(event);
      // Mark as processed (subscription service doesn't do this)
      await markWebhookProcessed(webhookId);
    } else if (
      event.type.startsWith('account.') ||
      event.type.startsWith('capability.') ||
      event.type.startsWith('account.external_account.')
    ) {
      // Handle onboarding-related events (marks as processed internally)
      await processOnboardingEvent(eventId);
    } else {
      // Handle other Stripe webhook types (payments, etc.)
      console.log(`Unhandled webhook event type: ${event.type}`);
      // Mark as processed even if unhandled (to avoid retries)
      await markWebhookProcessed(webhookId);
      // TODO: Add payment webhook processing when ready
    }

    const duration = Date.now() - startTime;
    console.log(
      `✅ Stripe webhook job completed successfully: ${eventId} - Duration: ${duration}ms`,
    );

    // Log database status
    try {
      const webhookEvent = await findWebhookById(webhookId);

      if (webhookEvent) {
        console.log(`📊 Database status for ${eventId}:`, {
          processed: webhookEvent.processed,
          processedAt: webhookEvent.processedAt,
          retryCount: webhookEvent.retryCount,
          error: webhookEvent.error || 'None',
        });
      } else {
        console.warn(`⚠️  Webhook event not found in database: ${webhookId}`);
      }
    } catch (dbError) {
      console.error(
        `❌ Failed to check database status for ${eventId}:`,
        dbError,
      );
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage
      = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Mark as failed (increments retry count, sets next retry time)
    try {
      const webhookEvent = await findWebhookById(webhookId);
      if (webhookEvent) {
        await markWebhookFailed(webhookId, errorMessage, errorStack);
      }
    } catch (markError) {
      console.error(
        `Failed to mark webhook as failed: ${webhookId}`,
        markError,
      );
    }

    console.error(
      `❌ Stripe webhook job failed: ${eventId} - Duration: ${duration}ms`,
      error,
    );
    throw error;
  }
}

/**
 * Job processing function for onboarding webhooks
 */
async function processOnboardingWebhookJob(job: {
  data: {
    webhookId: string;
    eventId: string;
    eventType: string;
  };
}): Promise<void> {
  const { webhookId, eventId, eventType } = job.data;
  const startTime = Date.now();

  console.log(
    `🚀 Starting onboarding webhook job: ${eventId} (${eventType}) - Job ID: ${webhookId}`,
  );

  try {
    await processOnboardingEvent(eventId);

    const duration = Date.now() - startTime;
    console.log(
      `✅ Onboarding webhook job completed successfully: ${eventId} - Duration: ${duration}ms`,
    );

    // Log database status
    try {
      const webhookEvent = await existsByStripeEventId(eventId);

      if (webhookEvent) {
        console.log(`📊 Database status for ${eventId}:`, {
          processed: webhookEvent.processed,
          processedAt: webhookEvent.processedAt,
          retryCount: webhookEvent.retryCount,
          error: webhookEvent.error || 'None',
        });
      } else {
        console.warn(`⚠️  Webhook event not found in database: ${eventId}`);
      }
    } catch (dbError) {
      console.error(
        `❌ Failed to check database status for ${eventId}:`,
        dbError,
      );
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      `❌ Onboarding webhook job failed: ${eventId} - Duration: ${duration}ms`,
      error,
    );
    throw error;
  }
}

/**
 * Create and configure workers for both queues
 */
const stripeWorker = new Worker(
  QUEUE_NAMES.STRIPE_WEBHOOKS, // Listen to payment webhooks queue
  processStripeWebhookJob, // Job processing function
  {
    connection: getRedisConnection(),
    concurrency: Number(process.env.WEBHOOK_WORKER_CONCURRENCY) || 5,

    // Job processing options
    removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
    removeOnFail: { count: 1000 }, // Keep last 1000 failed jobs
  },
);

const onboardingWorker = new Worker(
  QUEUE_NAMES.ONBOARDING_WEBHOOKS, // Listen to onboarding webhooks queue
  processOnboardingWebhookJob, // Job processing function
  {
    connection: getRedisConnection(),
    concurrency: Number(process.env.WEBHOOK_WORKER_CONCURRENCY) || 5,

    // Job processing options
    removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
    removeOnFail: { count: 1000 }, // Keep last 1000 failed jobs
  },
);

/**
 * Event listeners for monitoring and logging
 */

// Job completed successfully
stripeWorker.on('completed', (job, result) => {
  console.log(
    `✅ Stripe webhook job ${job.id} completed successfully:`,
    result,
  );
});

onboardingWorker.on('completed', (job, result) => {
  console.log(
    `✅ Onboarding webhook job ${job.id} completed successfully:`,
    result,
  );
});

// Job failed (after all retries)
stripeWorker.on('failed', (job, error) => {
  console.error(`❌ Stripe webhook job ${job?.id} failed:`, error);
});

onboardingWorker.on('failed', (job, error) => {
  console.error(`❌ Onboarding webhook job ${job?.id} failed:`, error);
});

// Worker error (not job-specific)
stripeWorker.on('error', (error) => {
  console.error('🚨 Stripe webhook worker error:', error);
});

onboardingWorker.on('error', (error) => {
  console.error('🚨 Onboarding webhook worker error:', error);
});

// Worker is ready to process jobs
stripeWorker.on('ready', () => {
  console.log('🚀 Stripe webhook worker ready to process jobs');
});

onboardingWorker.on('ready', () => {
  console.log('🚀 Onboarding webhook worker ready to process jobs');
});

// Worker is closing
stripeWorker.on('closing', () => {
  console.log('🔄 Stripe webhook worker closing...');
});

onboardingWorker.on('closing', () => {
  console.log('🔄 Onboarding webhook worker closing...');
});

// Worker has closed
stripeWorker.on('closed', () => {
  console.log('✅ Stripe webhook worker closed');
});

onboardingWorker.on('closed', () => {
  console.log('✅ Onboarding webhook worker closed');
});

/**
 * Graceful shutdown handling
 */
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n📡 Received ${signal}, shutting down gracefully...`);

  try {
    // Close both workers
    await Promise.all([stripeWorker.close(), onboardingWorker.close()]);

    // Close Redis connection
    const connection = getRedisConnection();
    await connection.quit();

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

// Log startup information
console.log('🔧 Webhook Worker Configuration:');
console.log(`  - Queue: ${QUEUE_NAMES.STRIPE_WEBHOOKS}`);
console.log(
  `  - Concurrency: ${Number(process.env.WEBHOOK_WORKER_CONCURRENCY) || 5}`,
);
console.log(`  - Redis Host: ${process.env.REDIS_HOST || 'localhost'}`);
console.log(`  - Redis Port: ${process.env.REDIS_PORT || 6379}`);
console.log(`  - Max Retries: ${Number(process.env.WEBHOOK_MAX_RETRIES) || 5}`);
console.log('');

// Start the worker
console.log('🚀 Starting webhook worker...');
