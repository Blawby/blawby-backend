/**
 * Auth Module Event Listeners
 *
 * Handles authentication and user-related events.
 */

import { getLogger } from '@logtape/logtape';
import {
  AuthUserSignedUp,
  AuthUserLoggedOut,
  AuthEmailVerified,
  AuthPasswordResetRequested,
  AuthPasswordChanged,
  AuthAccountDeleted,
  UserCreated,
  UserUpdated,
  UserDeleted,
  UserProfileUpdated,
  UserEmailChanged,
  UserAvatarUpdated,
} from '@/shared/events/definitions';
import { config } from '@/shared/config';
import { Event } from '@/shared/events/event';
import { queueManager } from '@/shared/queue/queue.manager';
import { EMAIL_TEMPLATES } from '@/shared/services/email';
import { logError } from '@/shared/utils/logging';

const logger = getLogger(['auth', 'listeners']);
const APP_URL = config.app.appUrl;

/**
 * Register all auth event listeners
 */
const registerAuthListeners = (): void => {
  logger.info('Registering auth event listeners...');

  // User signed up - send welcome email
  Event.listen(AuthUserSignedUp, async (payload) => {
    // Skip sending welcome email to anonymous users
    if (payload.is_anonymous) {
      logger.info('Skipping welcome email for anonymous user');
      return;
    }

    logger.info('User signed up, sending welcome email');

    void queueManager
      .addEmailJob(EMAIL_TEMPLATES.WELCOME, payload.email, 'Welcome to Blawby!', {
        recipientEmail: payload.email,
        recipientName: payload.name ?? 'User',
        dashboardUrl: `${APP_URL}/dashboard`,
        tutorialUrl: `${APP_URL}/docs/getting-started`,
        supportUrl: 'https://blawby.com/help',
      })
      .catch((error) => {
        logError('Failed to queue welcome email', error, {
          email: payload.email,
        });
      });
  });

  // User logged out
  Event.listen(AuthUserLoggedOut, async (payload) => {
    logger.info('User logged out', { userId: payload.user_id });
    // Future: Session cleanup, analytics, etc.
  });

  // Email verified
  Event.listen(AuthEmailVerified, async (payload) => {
    logger.info('Email verified', { userId: payload.user_id });
    // Future: Send confirmation, unlock features, etc.
  });

  // Password reset requested
  Event.listen(AuthPasswordResetRequested, async (payload) => {
    logger.info('Password reset requested', { email: payload.email });
    // Future: Send reset email, security logging, etc.
  });

  // Password changed
  Event.listen(AuthPasswordChanged, async (payload) => {
    logger.info('Password changed', { userId: payload.user_id });
    // Future: Security notification, invalidate sessions, etc.
  });

  // Account deleted
  Event.listen(AuthAccountDeleted, async (payload) => {
    logger.info('Account deleted', { userId: payload.user_id });
    // Future: Data cleanup, compliance logging, etc.
  });

  // User CRUD events
  Event.listen(UserCreated, async () => {
    logger.info('User created');
    // Future: Initial setup, default preferences, etc.
  });

  Event.listen(UserUpdated, async () => {
    logger.info('User updated');
    // Future: Cache invalidation, sync to external services, etc.
  });

  Event.listen(UserDeleted, async () => {
    logger.info('User deleted');
    // Future: Data cleanup, GDPR compliance, etc.
  });

  Event.listen(UserProfileUpdated, async () => {
    logger.info('User profile updated');
    // Future: Update search index, sync to CRM, etc.
  });

  Event.listen(UserEmailChanged, async () => {
    logger.info('User email changed');
    // Future: Send verification email, update external services, etc.
  });

  Event.listen(UserAvatarUpdated, async () => {
    logger.info('User avatar updated');
    // Future: Image processing, CDN cache invalidation, etc.
  });

  logger.info('Auth event listeners registered');
};

export { registerAuthListeners };
