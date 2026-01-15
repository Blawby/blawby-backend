/**
 * Onboarding Event Handlers
 *
 * Registers handlers for onboarding-related events.
 * These events track the Stripe Connect onboarding flow for organizations.
 */

import { EventType } from '@/shared/events/enums/event-types';
import { subscribeToEvent } from '@/shared/events/event-consumer';
import { handleOnboardingCompleted } from '@/modules/onboarding/handlers/onboarding-completed.handler';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';

/**
 * Register all onboarding event handlers
 */
export const registerOnboardingEvents = (): void => {
  console.info('Registering onboarding event handlers...');

  // Onboarding lifecycle events
  subscribeToEvent(EventType.ONBOARDING_STARTED, async (event: BaseEvent) => {
    console.info('Onboarding started', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Track onboarding progress, send reminders, etc.
  });

  subscribeToEvent(EventType.ONBOARDING_COMPLETED, handleOnboardingCompleted);

  subscribeToEvent(EventType.ONBOARDING_FAILED, async (event: BaseEvent) => {
    console.info('Onboarding failed', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Alert support, retry logic, etc.
  });

  // Stripe Connect account events (onboarding-related)
  subscribeToEvent(EventType.ONBOARDING_ACCOUNT_UPDATED, async (event: BaseEvent) => {
    console.info('Onboarding account updated', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Check completion status, update UI, etc.
  });

  subscribeToEvent(EventType.ONBOARDING_ACCOUNT_REQUIREMENTS_CHANGED, async (event: BaseEvent) => {
    console.info('Onboarding account requirements changed', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Notify user, update requirements UI, etc.
  });

  subscribeToEvent(EventType.ONBOARDING_ACCOUNT_CAPABILITIES_UPDATED, async (event: BaseEvent) => {
    console.info('Onboarding account capabilities updated', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Enable features, update permissions, etc.
  });

  // External account events (bank accounts)
  subscribeToEvent(EventType.ONBOARDING_EXTERNAL_ACCOUNT_CREATED, async (event: BaseEvent) => {
    console.info('Onboarding external account created', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Verify account, enable payouts, etc.
  });

  subscribeToEvent(EventType.ONBOARDING_EXTERNAL_ACCOUNT_UPDATED, async (event: BaseEvent) => {
    console.info('Onboarding external account updated', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Re-verify if needed, update payout settings, etc.
  });

  subscribeToEvent(EventType.ONBOARDING_EXTERNAL_ACCOUNT_DELETED, async (event: BaseEvent) => {
    console.info('Onboarding external account deleted', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Disable payouts, notify user, etc.
  });

  // Webhook processing events
  subscribeToEvent(EventType.ONBOARDING_WEBHOOK_RECEIVED, async (event: BaseEvent) => {
    console.info('Onboarding webhook received', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      payload: event.payload,
    });
    // Future: Logging, monitoring, etc.
  });

  subscribeToEvent(EventType.ONBOARDING_WEBHOOK_PROCESSED, async (event: BaseEvent) => {
    console.info('Onboarding webhook processed', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      payload: event.payload,
    });
    // Future: Success metrics, etc.
  });

  subscribeToEvent(EventType.ONBOARDING_WEBHOOK_FAILED, async (event: BaseEvent) => {
    console.error('Onboarding webhook failed', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      payload: event.payload,
    });
    // Future: Alert, retry logic, etc.
  });

  console.info('✅ Onboarding event handlers registered');
};
