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
import { addEmailJob } from '@/shared/queue/queue.manager';
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
  client_email: string;
  client_name: string;
  amount: number;
}): void => {
  // 1. Prospect-facing: "Your submission has been received"
  void addEmailJob(
    EMAIL_TEMPLATES.INTAKE_SUBMISSION_RECEIVED,
    payload.client_email,
    `Submission received — ${payload.organization_name}`,
    {
      recipientEmail: payload.client_email,
      recipientName: payload.client_name,
      practiceName: payload.organization_name,
      submittedAt: new Date().toISOString(),
    }
  ).catch((error) => {
    logError('Failed to queue intake submission received email', error, {
      intakeId: payload.intake_id,
      recipientEmail: payload.client_email,
    });
  });

  // 2. Practice-facing: "You've received a new intake submission"
  const practiceRecipient = payload.billing_email;
  if (practiceRecipient) {
    void addEmailJob(
      EMAIL_TEMPLATES.INTAKE_NEW_NOTIFICATION,
      practiceRecipient,
      `New intake submission from ${payload.client_name}`,
      {
        recipientEmail: practiceRecipient,
        recipientName: payload.organization_name,
        clientName: payload.client_name,
        clientEmail: payload.client_email,
        amount: payload.amount,
        intakeUrl: `${APP_URL}/dashboard/intakes/${payload.intake_id}`,
        practiceName: payload.organization_name,
      }
    ).catch((error) => {
      logError('Failed to queue intake new notification email', error, {
        intakeId: payload.intake_id,
        recipientEmail: practiceRecipient,
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
      logger.warn('No client email for intake payment succeeded, skipping submission emails', {
        intakeId: payload.intake_payment_id,
      });
      return;
    }

    sendSubmissionEmails({
      intake_id: payload.uuid,
      organization_name: payload.organization_name,
      billing_email: payload.billing_email,
      client_email: payload.client_email,
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
      void addEmailJob(
        EMAIL_TEMPLATES.INTAKE_ACCEPTED,
        payload.client_email,
        `Your case has been accepted — ${payload.organization_name}`,
        {
          recipientEmail: payload.client_email,
          recipientName: payload.client_name,
          practiceName: payload.organization_name,
        }
      ).catch((error) => {
        logError('Failed to queue intake accepted email', error, {
          intakeId: payload.intake_id,
          recipientEmail: payload.client_email,
        });
      });
    } else if (payload.triage_status === 'declined') {
      void addEmailJob(
        EMAIL_TEMPLATES.INTAKE_DECLINED,
        payload.client_email,
        `Update on your submission — ${payload.organization_name}`,
        {
          recipientEmail: payload.client_email,
          recipientName: payload.client_name,
          practiceName: payload.organization_name,
          reason: payload.triage_reason ?? undefined,
        }
      ).catch((error) => {
        logError('Failed to queue intake declined email', error, {
          intakeId: payload.intake_id,
          recipientEmail: payload.client_email,
        });
      });
    }
  });

  logger.info('Practice client intake event listeners registered');
};
