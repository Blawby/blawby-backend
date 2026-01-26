/**
 * Practice Client Intakes Module Event Listeners
 *
 * Handles intake payment events for analytics and notifications.
 * Note: Status updates are handled directly in webhook handlers.
 */

import { getLogger } from '@logtape/logtape';
import {
  IntakePaymentCreated,
  IntakePaymentSucceeded,
  IntakePaymentFailed,
  IntakePaymentCanceled,
} from '@/shared/events/definitions';
import { Event } from '@/shared/events/event';

const logger = getLogger(['practice-client-intakes', 'listeners']);

/**
 * Register all practice client intake event listeners
 */
export function registerPracticeClientIntakesListeners(): void {
  logger.info('Registering practice client intakes event listeners...');

  Event.listen(IntakePaymentCreated, async () => {
    logger.info('Intake payment created');
    // Future: Send confirmation email, analytics tracking, etc.
  });

  Event.listen(IntakePaymentSucceeded, async (payload) => {
    logger.info('Intake payment succeeded', {
      intakeId: payload.intake_payment_id,
    });
    // Future: Send receipt email, update analytics, trigger workflows, etc.
  });

  Event.listen(IntakePaymentFailed, async (payload) => {
    logger.info('Intake payment failed', {
      intakeId: payload.intake_payment_id,
    });
    // Future: Send failure notification, retry logic, analytics tracking, etc.
  });

  Event.listen(IntakePaymentCanceled, async (payload) => {
    logger.info('Intake payment canceled', {
      intakeId: payload.intake_payment_id,
    });
    // Future: Analytics tracking, cleanup tasks, etc.
  });

  logger.info('Practice client intake event listeners registered');
}
