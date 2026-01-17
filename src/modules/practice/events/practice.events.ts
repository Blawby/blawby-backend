/**
 * Practice Event Handlers
 *
 * Registers handlers for practice-related events.
 * Since organizations = practices in our domain model, these handlers
 * process events for both organization and practice operations.
 */

import { EventType } from '@/shared/events/enums/event-types';
import { subscribeToEvent } from '@/shared/events/event-consumer';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';

/**
 * Register all practice event handlers
 */
export const registerPracticeEvents = (): void => {
  console.info('Registering practice event handlers...');

  // Practice created - organization/practice created
  subscribeToEvent(EventType.PRACTICE_CREATED, async (event: BaseEvent) => {
    console.info('Practice created', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
    // Future: Send welcome email, analytics tracking, etc.
  });

  // Practice updated - organization/practice updated
  subscribeToEvent(EventType.PRACTICE_UPDATED, async (event: BaseEvent) => {
    console.info('Practice updated', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
    // Future: Analytics tracking, cache invalidation, etc.
  });

  // Practice deleted - organization/practice deleted
  subscribeToEvent(EventType.PRACTICE_DELETED, async (event: BaseEvent) => {
    console.info('Practice deleted', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
    // Future: Cleanup tasks, analytics tracking, etc.
  });

  // Practice details created
  subscribeToEvent(EventType.PRACTICE_DETAILS_CREATED, async (event: BaseEvent) => {
    console.info('Practice details created', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
  });

  // Practice details updated
  subscribeToEvent(EventType.PRACTICE_DETAILS_UPDATED, async (event: BaseEvent) => {
    console.info('Practice details updated', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
  });

  // Practice details deleted
  subscribeToEvent(EventType.PRACTICE_DETAILS_DELETED, async (event: BaseEvent) => {
    console.info('Practice details deleted', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
  });

  // Practice switched - active practice/organization switched
  subscribeToEvent(EventType.PRACTICE_SWITCHED, async (event: BaseEvent) => {
    console.info('Practice switched', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
    // Future: Update session, analytics tracking, etc.
  });

  console.info('✅ Practice event handlers registered');
};
