import { getLogger } from '@logtape/logtape';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';

const logger = getLogger(['onboarding', 'handler', 'webhook-events']);

/**
 * Handle onboarding webhook received
 */
export const handleWebhookReceived = async (event: BaseEvent): Promise<void> => {
  logger.debug("Onboarding webhook received: {eventType} ({stripeEventId})", {
    eventType: event.payload?.event_type,
    stripeEventId: event.payload?.stripe_event_id,
    organizationId: event.organizationId,
  });
};

/**
 * Handle onboarding webhook processed
 */
export const handleWebhookProcessed = async (event: BaseEvent): Promise<void> => {
  logger.info("Onboarding webhook processed successfully: {eventType} ({stripeEventId})", {
    eventType: event.payload?.event_type,
    stripeEventId: event.payload?.stripe_event_id,
    organizationId: event.organizationId,
  });
};

/**
 * Handle onboarding webhook failed
 */
export const handleWebhookFailed = async (event: BaseEvent): Promise<void> => {
  logger.error("Onboarding webhook processing failed: {eventType} ({stripeEventId}) - {error}", {
    eventType: event.payload?.event_type,
    stripeEventId: event.payload?.stripe_event_id,
    organizationId: event.organizationId,
    error: event.payload?.error,
  });
};
