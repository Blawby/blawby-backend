import { getLogger } from '@logtape/logtape';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';

const logger = getLogger(['onboarding', 'handler', 'onboarding-started']);

/**
 * Handle onboarding started event
 */
export const handleOnboardingStarted = async (event: BaseEvent): Promise<void> => {
  logger.info("Onboarding started for organization {organizationId} by user {actorId}", {
    organizationId: event.organizationId,
    actorId: event.actorId,
    eventId: event.eventId,
  });

  // Future: Track onboarding progress, send reminders, metrics, etc.
};
