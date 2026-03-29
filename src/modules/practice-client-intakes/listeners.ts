/**
 * Practice Client Intakes Module Event Listeners
 *
 * Handles intake events for email notifications.
 * Pattern: Event → Listener → addEmailJob (outbox pattern)
 */

import { getLogger } from '@logtape/logtape';
import {
  IntakePaymentCreated,
  IntakePaymentSucceeded,
  IntakePaymentFailed,
  IntakePaymentCanceled,
  IntakeSubmitted,
  IntakeTriaged,
} from '@/shared/events/definitions';
import { Event } from '@/shared/events/event';
import { queueManager } from '@/shared/queue/queue.manager';
import { EMAIL_TEMPLATES } from '@/shared/services/email';
import { config } from '@/shared/config';
import { logError } from '@/shared/utils/logging';

const logger = getLogger(['practice-client-intakes', 'listeners']);
const APP_URL = config.app.appUrl;

/**
 * Send submission notification emails (prospect confirmation + practice notification)
 */
const sendSubmissionEmails = (payload: {
  intake_id: string;
  organization_name: string;
  billing_email: string | null;
  client_email: string | null;
  client_name: string;
  amount: number;
}): void => {
  // Determine recipient for client-facing email (prefer client_email, fallback to billing_email)
  const clientRecipient = payload.client_email ?? payload.billing_email;

  // 1. Prospect-facing: "Your submission has been received"
  if (clientRecipient) {
    void queueManager
      .addEmailJob(
        EMAIL_TEMPLATES.INTAKE_SUBMISSION_RECEIVED,
        clientRecipient,
        `Submission received — ${payload.organization_name}`,
        {
          recipientEmail: clientRecipient,
          recipientName: payload.client_name,
          practiceName: payload.organization_name,
          submittedAt: new Date().toISOString(),
        }
      )
      .catch((error: unknown) => {
        logError('Failed to queue intake submission received email', error, {
          intakeId: payload.intake_id,
        });
      });
  }

  // 2. Practice-facing: "You've received a new intake submission"
  const practiceRecipient = payload.billing_email;
  if (practiceRecipient) {
    void queueManager
      .addEmailJob(
        EMAIL_TEMPLATES.INTAKE_NEW_NOTIFICATION,
        practiceRecipient,
        `New intake submission from ${payload.client_name}`,
        {
          recipientEmail: practiceRecipient,
          recipientName: payload.organization_name,
          clientName: payload.client_name,
          clientEmail: payload.client_email ?? payload.billing_email ?? 'N/A',
          amount: payload.amount,
          intakeUrl: `${APP_URL}/dashboard/intakes/${payload.intake_id}`,
          practiceName: payload.organization_name,
        }
      )
      .catch((error: unknown) => {
        logError('Failed to queue intake new notification email', error, {
          intakeId: payload.intake_id,
        });
      });
  }
};

/**
 * Register all practice client intake event listeners
 */
export const registerPracticeClientIntakesListeners = (): void => {
  logger.info('Registering practice client intakes event listeners...');

  Event.listen(IntakePaymentCreated, async () => {
    logger.info('Intake payment created');
  });

  // Payment path: when payment succeeds, intake is complete — send submission emails
  Event.listen(IntakePaymentSucceeded, async (payload) => {
    logger.info('Intake payment succeeded', {
      intakeId: payload.intake_payment_id,
    });

    if (!payload.client_email) {
      logger.warn('No client_email for intake payment succeeded, will use billing_email as fallback if available', {
        intakeId: payload.intake_payment_id,
        hasBillingEmail: Boolean(payload.billing_email),
      });
    }

    sendSubmissionEmails({
      intake_id: payload.uuid,
      organization_name: payload.organization_name,
      billing_email: payload.billing_email,
      client_email: payload.client_email ?? null,
      client_name: payload.client_name ?? 'Valued Client',
      amount: payload.amount,
    });
  });

  // Bypass path: when intake is submitted without payment
  Event.listen(IntakeSubmitted, async (payload) => {
    logger.info('Intake submitted (bypass)', {
      intakeId: payload.intake_id,
    });

    sendSubmissionEmails({
      intake_id: payload.intake_id,
      organization_name: payload.organization_name,
      billing_email: payload.billing_email,
      client_email: payload.client_email,
      client_name: payload.client_name,
      amount: payload.amount,
    });
  });

  Event.listen(IntakePaymentFailed, async (payload) => {
    logger.info('Intake payment failed', {
      intakeId: payload.intake_payment_id,
    });
  });

  Event.listen(IntakePaymentCanceled, async (payload) => {
    logger.info('Intake payment canceled', {
      intakeId: payload.intake_payment_id,
    });
  });

  // Triage events: send acceptance/decline emails to prospect
  Event.listen(IntakeTriaged, async (payload) => {
    logger.info('Intake triaged', {
      intakeId: payload.intake_id,
      triageStatus: payload.triage_status,
    });

    if (payload.triage_status === 'accepted') {
      void queueManager
        .addEmailJob(
          EMAIL_TEMPLATES.INTAKE_ACCEPTED,
          payload.client_email,
          `Your case has been accepted — ${payload.organization_name}`,
          {
            recipientEmail: payload.client_email,
            recipientName: payload.client_name,
            practiceName: payload.organization_name,
          }
        )
        .catch((error: unknown) => {
          logError('Failed to queue intake accepted email', error, {
            intakeId: payload.intake_id,
          });
        });
    } else if (payload.triage_status === 'declined') {
      void queueManager
        .addEmailJob(
          EMAIL_TEMPLATES.INTAKE_DECLINED,
          payload.client_email,
          `Update on your submission — ${payload.organization_name}`,
          {
            recipientEmail: payload.client_email,
            recipientName: payload.client_name,
            practiceName: payload.organization_name,
            reason: payload.triage_reason ?? undefined,
          }
        )
        .catch((error: unknown) => {
          logError('Failed to queue intake declined email', error, {
            intakeId: payload.intake_id,
          });
        });
    }
  });

  logger.info('Practice client intake event listeners registered');
};
