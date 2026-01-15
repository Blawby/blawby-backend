/**
 * User & Authentication Event Handlers
 *
 * Registers handlers for user and authentication-related events.
 * These events are published from Better Auth hooks and other user operations.
 */

import { EventType } from '@/shared/events/enums/event-types';
import { subscribeToEvent } from '@/shared/events/event-consumer';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';

/**
 * Register all user and authentication event handlers
 */
export const registerUserEvents = (): void => {
  console.info('Registering user and authentication event handlers...');

  // Authentication events
  subscribeToEvent(EventType.AUTH_USER_SIGNED_UP, async (event: BaseEvent) => {
    console.info('User signed up', {
      eventId: event.eventId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Welcome email, onboarding flow trigger, etc.
  });

  subscribeToEvent(EventType.AUTH_USER_LOGGED_IN, async (event: BaseEvent) => {
    console.info('User logged in', {
      eventId: event.eventId,
      actorId: event.actorId,
      organizationId: event.organizationId,
      payload: event.payload,
    });
    // Future: Session tracking, analytics, etc.
  });

  subscribeToEvent(EventType.AUTH_USER_LOGGED_OUT, async (event: BaseEvent) => {
    console.info('User logged out', {
      eventId: event.eventId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Session cleanup, analytics, etc.
  });

  subscribeToEvent(EventType.AUTH_EMAIL_VERIFIED, async (event: BaseEvent) => {
    console.info('Email verified', {
      eventId: event.eventId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Send confirmation, unlock features, etc.
  });

  subscribeToEvent(EventType.AUTH_PASSWORD_RESET_REQUESTED, async (event: BaseEvent) => {
    console.info('Password reset requested', {
      eventId: event.eventId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Send reset email, security logging, etc.
  });

  subscribeToEvent(EventType.AUTH_PASSWORD_CHANGED, async (event: BaseEvent) => {
    console.info('Password changed', {
      eventId: event.eventId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Security notification, invalidate sessions, etc.
  });

  subscribeToEvent(EventType.AUTH_ACCOUNT_DELETED, async (event: BaseEvent) => {
    console.info('Account deleted', {
      eventId: event.eventId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Data cleanup, compliance logging, etc.
  });

  // User CRUD events
  subscribeToEvent(EventType.USER_CREATED, async (event: BaseEvent) => {
    console.info('User created', {
      eventId: event.eventId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Initial setup, default preferences, etc.
  });

  subscribeToEvent(EventType.USER_UPDATED, async (event: BaseEvent) => {
    console.info('User updated', {
      eventId: event.eventId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Cache invalidation, sync to external services, etc.
  });

  subscribeToEvent(EventType.USER_DELETED, async (event: BaseEvent) => {
    console.info('User deleted', {
      eventId: event.eventId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Data cleanup, GDPR compliance, etc.
  });

  subscribeToEvent(EventType.USER_PROFILE_UPDATED, async (event: BaseEvent) => {
    console.info('User profile updated', {
      eventId: event.eventId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Update search index, sync to CRM, etc.
  });

  subscribeToEvent(EventType.USER_EMAIL_CHANGED, async (event: BaseEvent) => {
    console.info('User email changed', {
      eventId: event.eventId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Send verification email, update external services, etc.
  });

  subscribeToEvent(EventType.USER_AVATAR_UPDATED, async (event: BaseEvent) => {
    console.info('User avatar updated', {
      eventId: event.eventId,
      actorId: event.actorId,
      payload: event.payload,
    });
    // Future: Image processing, CDN cache invalidation, etc.
  });

  console.info('✅ User and authentication event handlers registered');
};
