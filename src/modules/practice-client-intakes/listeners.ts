/**
 * Practice Client Intakes Module Event Listeners
 *
 * Handles intake events for email notifications.
 * Pattern: Event → Listener → addEmailJob (outbox pattern)
 */

import { getLogger } from '@logtape/logtape';
import { config } from '@/shared/config';
import {
  IntakePaymentCreated,
  IntakePaymentSucceeded,
  IntakePaymentFailed,
  IntakePaymentCanceled,
  IntakeTriaged,
  IntakeSubmitted,
} from '@/shared/events/definitions';
import { Event } from '@/shared/events/event';
import { clientsCrudService } from '@/modules/clients/services/clients-crud.service';
import { intakeLifecycleService } from '@/modules/practice-client-intakes/services/intake-lifecycle.service';
import { queueManager } from '@/shared/queue/queue.manager';
import { EMAIL_TEMPLATES } from '@/shared/services/email';
import { logError } from '@/shared/utils/logging';
import { createSystemContext } from '@/shared/types/service-context';
import { HTTPException } from 'hono/http-exception';

const logger = getLogger(['practice-client-intakes', 'listeners']);

/**
 * Send submission notification emails (prospect confirmation + practice notification)
 */
const sendSubmissionEmails = async (payload: {
  intake_id: string;
  organization_name: string;
  organization_id?: string;
  organization_slug?: string;
  billing_email: string | null;
  client_email: string | null;
  client_name: string;
  amount: number;
  practice_service_name?: string;
  jurisdiction?: string;
  court_date?: string;
  has_documents?: boolean;
  case_strength?: number;
  desired_outcome?: string;
  opposing_party?: string;
  description?: string;
  submitted_at?: string;
}): Promise<void> => {
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
    const practiceServiceName =
      payload.practice_service_name || payload.description?.substring(0, 50) || 'General inquiry';

    const submittedAt = payload.submitted_at
      ? new Date(payload.submitted_at).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Recently';

    const courtDate = payload.court_date
      ? new Date(payload.court_date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : undefined;

    const baseUrl = config.app.frontendUrls[0] || config.app.appUrl;
    const practiceIntakeUrl = payload.organization_slug
      ? `${baseUrl}/practice/${payload.organization_slug}/intakes/${payload.intake_id}`
      : `${baseUrl}/dashboard/intakes/${payload.intake_id}`;

    void queueManager
      .addEmailJob(
        EMAIL_TEMPLATES.INTAKE_NEW_NOTIFICATION,
        practiceRecipient,
        `New Intake for: ${practiceServiceName} — ${payload.client_name}`,
        {
          recipientEmail: practiceRecipient,
          recipientName: payload.organization_name,
          clientName: payload.client_name,
          clientEmail: payload.client_email ?? payload.billing_email ?? 'N/A',
          amount: payload.amount,
          intakeUrl: practiceIntakeUrl,
          practiceName: payload.organization_name,
          matterType: practiceServiceName,
          jurisdiction: payload.jurisdiction || 'Not specified',
          courtDate,
          hasDocuments: payload.has_documents ?? false,
          caseStrength: payload.case_strength,
          desiredOutcome: payload.desired_outcome,
          opposingParty: payload.opposing_party,
          submittedAt,
          intakeId: payload.intake_id,
          acceptUrl: `${practiceIntakeUrl}?action=accept`,
          declineUrl: `${practiceIntakeUrl}?action=decline`,
          conflictCheckUrl: `${practiceIntakeUrl}?action=conflict-check`,
          description: payload.description,
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

    await sendSubmissionEmails({
      intake_id: payload.uuid,
      organization_name: payload.organization_name,
      organization_id: payload.organization_id,
      organization_slug: payload.organization_slug,
      billing_email: payload.billing_email,
      client_email: payload.client_email ?? null,
      client_name: payload.client_name ?? 'Valued Client',
      amount: payload.amount,
      practice_service_name: payload.practice_service_name,
      jurisdiction: payload.jurisdiction,
      court_date: payload.court_date,
      has_documents: payload.has_documents,
      case_strength: payload.case_strength,
      desired_outcome: payload.desired_outcome,
      opposing_party: payload.opposing_party,
      description: payload.description,
      submitted_at: payload.submitted_at,
    });
  });

  // Bypass path: when intake is submitted without payment
  Event.listen(IntakeSubmitted, async (payload) => {
    logger.info('Intake submitted (bypass)', {
      intakeId: payload.intake_id,
    });

    await sendSubmissionEmails({
      intake_id: payload.intake_id,
      organization_name: payload.organization_name,
      organization_id: payload.organization_id,
      organization_slug: payload.organization_slug,
      billing_email: payload.billing_email,
      client_email: payload.client_email,
      client_name: payload.client_name,
      amount: payload.amount,
      practice_service_name: payload.practice_service_name,
      jurisdiction: payload.jurisdiction,
      court_date: payload.court_date,
      has_documents: payload.has_documents,
      case_strength: payload.case_strength,
      desired_outcome: payload.desired_outcome,
      opposing_party: payload.opposing_party,
      description: payload.description,
      submitted_at: payload.submitted_at,
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

      // Accepted triage is the backend trigger for invitation + linkage.
      const systemCtx = createSystemContext(payload.organization_id);

      const invitationResult = await intakeLifecycleService.triggerInvitation({ uuid: payload.intake_id }, systemCtx);
      if (!invitationResult.success) {
        logError('Failed to trigger magic link on accepted intake', invitationResult.error ?? invitationResult, {
          intakeId: payload.intake_id,
          organizationId: payload.organization_id,
        });
      }

      void clientsCrudService
        .createClientFromIntake(
          {
            data: {
              intakeId: payload.intake_id,
              email: payload.client_email,
              name: payload.client_name,
            },
          },
          systemCtx
        )
        .catch((error: unknown) => {
          if (error instanceof HTTPException && error.status === 409) {
            logger.info('Client already linked for accepted intake {intakeId}', {
              intakeId: payload.intake_id,
            });
            return;
          }

          logError('Failed to link client on accepted intake', error, {
            intakeId: payload.intake_id,
            organizationId: payload.organization_id,
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
