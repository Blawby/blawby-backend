/**
 * Practice Client Intakes Event Handlers
 *
 * Registers handlers for practice client intake payment events.
 * Status updates are handled directly in webhook handlers (succeeded.ts, failed.ts, canceled.ts).
 * These event handlers are for analytics, emails, and other side effects only.
 */

import { EventType } from '@/shared/events/enums/event-types';
import { subscribeToEvent } from '@/shared/events/event-consumer';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';

/**
 * Register all practice client intake event handlers
 */
export const registerPracticeClientIntakeEvents = (): void => {
  console.info('Registering practice client intake event handlers...');

  // Intake payment created (already published from service)
  subscribeToEvent(EventType.INTAKE_PAYMENT_CREATED, async (event: BaseEvent) => {
    console.info('Intake payment created', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
    // Future: Send confirmation email, analytics tracking, etc.
  });

  // Intake payment succeeded (published after DB update)
  subscribeToEvent(EventType.INTAKE_PAYMENT_SUCCEEDED, async (event: BaseEvent) => {
    console.info('Intake payment succeeded', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
    // Future: Send receipt email, update analytics, trigger workflows, etc.
  });

  // Intake payment failed (published after DB update)
  subscribeToEvent(EventType.INTAKE_PAYMENT_FAILED, async (event: BaseEvent) => {
    console.info('Intake payment failed', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
    // Future: Send failure notification, retry logic, analytics tracking, etc.
  });

  // Intake payment canceled (published after DB update)
  subscribeToEvent(EventType.INTAKE_PAYMENT_CANCELED, async (event: BaseEvent) => {
    console.info('Intake payment canceled', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
    // Future: Analytics tracking, cleanup tasks, etc.
  });

  console.info('✅ Practice client intake event handlers registered');
};
