import { getLogger } from '@logtape/logtape';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';

const logger = getLogger(['onboarding', 'handler', 'onboarding-failed']);

/**
 * Handle onboarding failed event
 */
export const handleOnboardingFailed = async (event: BaseEvent): Promise<void> => {
  logger.error("Onboarding failed for organization {organizationId}", {
    organizationId: event.organizationId,
    actorId: event.actorId,
    eventId: event.eventId,
    error: event.payload?.error,
  });

  // Future: Alert support, retry logic, user notification, etc.
};
