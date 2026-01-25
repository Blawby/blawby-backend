/**
 * System Event Listeners
 *
 * Handles internal system events like health checks, errors, and sessions.
 */

import { getLogger } from '@logtape/logtape';
import {
  SystemHealthCheckPerformed,
  SystemErrorOccurred,
  SystemPerformanceDegraded,
  SessionCreated,
  SessionExpired,
  SessionInvalidated,
} from '@/shared/events/definitions';
import { Event } from '@/shared/events/event';

const logger = getLogger(['system', 'listeners']);

/**
 * Register all system event listeners
 */
export function registerSystemListeners(): void {
  logger.info('Registering system event listeners...');

  Event.listen(SystemHealthCheckPerformed, async () => {
    logger.info('System health check performed');
  });

  Event.listen(SystemErrorOccurred, async (payload) => {
    logger.error('System error occurred', {
      error: payload.error,
      context: payload.context,
    });
    // Could trigger alerting here
  });

  Event.listen(SystemPerformanceDegraded, async () => {
    logger.warn('System performance degraded');
    // Could trigger performance monitoring alerts
  });

  Event.listen(SessionCreated, async (payload) => {
    logger.info('Session created', {
      userId: payload.user_id,
      sessionId: payload.session_id,
    });
  });

  Event.listen(SessionExpired, async (payload) => {
    logger.info('Session expired', {
      userId: payload.user_id,
      sessionId: payload.session_id,
    });
  });

  Event.listen(SessionInvalidated, async (payload) => {
    logger.info('Session invalidated', {
      userId: payload.user_id,
      sessionId: payload.session_id,
    });
  });

  logger.info('System event listeners registered');
}
