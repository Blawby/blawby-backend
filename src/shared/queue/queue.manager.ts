import { Queue, QueueEvents } from 'bullmq';

import { QUEUE_NAMES, queueConfig } from './queue.config';
import { getRedisConnection } from './redis.client';

/**
 * Queue Manager - Functional approach for managing BullMQ queues
 *
 * Architecture:
 * - Queue: Used in API to ADD jobs (producer)
 * - Worker: Separate process to PROCESS jobs (consumer)
 * - Redis: Message broker connecting them
 */

// Private state - module-level singleton
const queues = new Map<string, Queue>();
const queueEvents = new Map<string, QueueEvents>();

/**
 * Get or create a queue by name
 * Uses singleton pattern to ensure single queue instance throughout app
 */
export const getQueue = function getQueue(name: string): Queue {
  if (!queues.has(name)) {
    const queue = new Queue(name, {
      connection: getRedisConnection(),
      defaultJobOptions: queueConfig.defaultJobOptions,
    });

    // Add error listener for queue connection issues
    queue.on('error', (error) => {
      console.error(`Queue ${name} error:`, error);
    });

    // Set up QueueEvents for job lifecycle monitoring
    if (!queueEvents.has(name)) {
      const events = new QueueEvents(name, {
        connection: getRedisConnection(),
      });

      events.on('waiting', ({ jobId }) => {
        console.log(`Job ${jobId} waiting in queue ${name}`);
      });

      events.on('active', ({ jobId, prev }) => {
        console.log(
          `Job ${jobId} is now active in queue ${name}; previous status was ${prev}`,
        );
      });

      events.on('completed', ({ jobId, returnvalue }) => {
        console.log(
          `Job ${jobId} completed in queue ${name} with result:`,
          returnvalue,
        );
      });

      events.on('failed', ({ jobId, failedReason }) => {
        console.error(`Job ${jobId} failed in queue ${name}:`, failedReason);
      });

      events.on('error', (error) => {
        console.error(`QueueEvents ${name} error:`, error);
      });

      queueEvents.set(name, events);
    }

    queues.set(name, queue);
  }
  return queues.get(name)!;
};

/**
 * Get the webhook processing queue
 */
export const getWebhookQueue = function getWebhookQueue(): Queue {
  return getQueue(QUEUE_NAMES.STRIPE_WEBHOOKS);
};

/**
 * Get QueueEvents for a specific queue (for advanced monitoring)
 */
export const getQueueEvents = function getQueueEvents(
  name: string,
): QueueEvents {
  // Ensure the queue exists first (this will create QueueEvents if needed)
  getQueue(name);
  return queueEvents.get(name)!;
};

/**
 * Add a webhook processing job to the queue
 */
export const addWebhookJob = async function addWebhookJob(
  webhookId: string,
  eventId: string,
  eventType: string,
): Promise<void> {
  const queue = getWebhookQueue();

  await queue.add(
    'process-webhook',
    {
      webhookId,
      eventId,
      eventType,
    },
    {
      jobId: eventId, // Use Stripe event ID for deduplication
      removeOnComplete: queueConfig.defaultJobOptions.removeOnComplete,
      removeOnFail: queueConfig.defaultJobOptions.removeOnFail,
    },
  );

  console.log(`Webhook job queued: ${eventId} (${eventType})`);
};

/**
 * Get queue statistics for monitoring
 */
export const getQueueStats = async function getQueueStats(
  queueName: string,
): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  const queue = getQueue(queueName);

  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaiting(),
    queue.getActive(),
    queue.getCompleted(),
    queue.getFailed(),
  ]);

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
  };
};

/**
 * Clean up all queues and Redis connection
 */
export const closeQueues = async function closeQueues(): Promise<void> {
  console.log('Closing queue manager...');

  // Close all queue events
  await Promise.all(
    Array.from(queueEvents.values()).map(events => events.close()),
  );

  // Close all queues
  await Promise.all(Array.from(queues.values()).map(q => q.close()));

  // Close Redis connection
  const connection = getRedisConnection();
  await connection.quit();

  console.log('Queue manager closed');
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
