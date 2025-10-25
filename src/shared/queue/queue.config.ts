export const QUEUE_NAMES = {
  STRIPE_WEBHOOKS: 'stripe-webhooks',
  ONBOARDING_WEBHOOKS: 'onboarding-webhooks',
  EVENTS: 'events', // New: General event listeners
  ANALYTICS: 'analytics', // New: Analytics tracking
  EMAILS: 'emails', // New: Email processing
} as const;

export const JOB_NAMES = {
  PROCESS_WEBHOOK: 'process-webhook',
} as const;

export const queueConfig = {
  defaultJobOptions: {
    attempts: Number(process.env.WEBHOOK_MAX_RETRIES) || 5,
    backoff: {
      type: 'exponential' as const,
      delay: 60000, // Start with 1 minute
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 1000, // Keep last 1000 failed jobs
  },
};
