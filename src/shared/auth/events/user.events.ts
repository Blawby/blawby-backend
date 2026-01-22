/**
 * User & Authentication Event Handlers
 *
 * Registers handlers for user and authentication-related events.
 * These events are published from Better Auth hooks and other user operations.
 */

import { getLogger } from '@logtape/logtape';
import { EventType } from '@/shared/events/enums/event-types';
import { subscribeToEvent } from '@/shared/events/event-consumer';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import { addEmailJob } from '@/shared/queue/queue.manager';
import { EMAIL_TEMPLATES } from '@/shared/services/email';
import { logError } from '@/shared/utils/logging';

const logger = getLogger(['auth', 'events', 'user']);
const APP_URL = process.env.APP_URL || 'https://app.blawby.com';

/**
 * Register all user and authentication event handlers
 */
export const registerUserEvents = (): void => {
  logger.info('Registering user and authentication event handlers...');

  // Authentication events
  subscribeToEvent(EventType.AUTH_USER_SIGNED_UP, async (event: BaseEvent) => {
    // Skip sending welcome email to anonymous users
    const payload = event.payload as { email: string; name: string; is_anonymous?: boolean };
    if (payload.is_anonymous) {
      logger.info('Skipping welcome email for anonymous user {eventId}', {
        eventId: event.eventId,
        actorId: event.actorId,
      });
      return;
    }

    logger.info('User signed up, sending welcome email for {eventId}', {
      eventId: event.eventId,
      actorId: event.actorId,
    });

    // Send welcome email (fire and forget)
    const { email, name } = payload;

    void addEmailJob(
      EMAIL_TEMPLATES.WELCOME,
      email,
      'Welcome to Blawby!',
      {
        recipientEmail: email,
        recipientName: name,
        dashboardUrl: `${APP_URL}/dashboard`,
        tutorialUrl: `${APP_URL}/docs/getting-started`,
        supportUrl: 'https://blawby.com/support',
      },
    ).catch((error) => {
      logError('Failed to queue welcome email', error, {
        eventId: event.eventId,
      });
    });
  });

  subscribeToEvent(EventType.AUTH_USER_LOGGED_OUT, async (event: BaseEvent) => {
    console.info('User logged out', {
      eventId: event.eventId,
      actorId: event.actorId,
    });
    // Future: Session cleanup, analytics, etc.
  });

  subscribeToEvent(EventType.AUTH_EMAIL_VERIFIED, async (event: BaseEvent) => {
    console.info('Email verified', {
      eventId: event.eventId,
      actorId: event.actorId,
    });
    // Future: Send confirmation, unlock features, etc.
  });

  subscribeToEvent(EventType.AUTH_PASSWORD_RESET_REQUESTED, async (event: BaseEvent) => {
    console.info('Password reset requested', {
      eventId: event.eventId,
      actorId: event.actorId,
    });
    // Future: Send reset email, security logging, etc.
  });

  subscribeToEvent(EventType.AUTH_PASSWORD_CHANGED, async (event: BaseEvent) => {
    console.info('Password changed', {
      eventId: event.eventId,
      actorId: event.actorId,
    });
    // Future: Security notification, invalidate sessions, etc.
  });

  subscribeToEvent(EventType.AUTH_ACCOUNT_DELETED, async (event: BaseEvent) => {
    console.info('Account deleted', {
      eventId: event.eventId,
      actorId: event.actorId,
    });
    // Future: Data cleanup, compliance logging, etc.
  });

  // User CRUD events
  subscribeToEvent(EventType.USER_CREATED, async (event: BaseEvent) => {
    console.info('User created', {
      eventId: event.eventId,
      actorId: event.actorId,
    });
    // Future: Initial setup, default preferences, etc.
  });

  subscribeToEvent(EventType.USER_UPDATED, async (event: BaseEvent) => {
    console.info('User updated', {
      eventId: event.eventId,
      actorId: event.actorId,
    });
    // Future: Cache invalidation, sync to external services, etc.
  });

  subscribeToEvent(EventType.USER_DELETED, async (event: BaseEvent) => {
    console.info('User deleted', {
      eventId: event.eventId,
      actorId: event.actorId,
    });
    // Future: Data cleanup, GDPR compliance, etc.
  });

  subscribeToEvent(EventType.USER_PROFILE_UPDATED, async (event: BaseEvent) => {
    console.info('User profile updated', {
      eventId: event.eventId,
      actorId: event.actorId,
    });
    // Future: Update search index, sync to CRM, etc.
  });

  subscribeToEvent(EventType.USER_EMAIL_CHANGED, async (event: BaseEvent) => {
    console.info('User email changed', {
      eventId: event.eventId,
      actorId: event.actorId,
    });
    // Future: Send verification email, update external services, etc.
  });

  subscribeToEvent(EventType.USER_AVATAR_UPDATED, async (event: BaseEvent) => {
    console.info('User avatar updated', {
      eventId: event.eventId,
      actorId: event.actorId,
    });
    // Future: Image processing, CDN cache invalidation, etc.
  });

  console.info('✅ User and authentication event handlers registered');
};
