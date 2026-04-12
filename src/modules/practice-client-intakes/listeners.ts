/**
 * Practice Client Intakes Module Event Listeners
 *
 * Handles intake events for email notifications.
 * Pattern: Event → Listener → addEmailJob (outbox pattern)
 */

import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { config } from '@/shared/config';
import { db } from '@/shared/database';
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
import {
  practiceClientIntakes,
  type PracticeClientIntakeMetadata,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';

const logger = getLogger(['practice-client-intakes', 'listeners']);
const APP_URL = config.app.appUrl;

const normalizePracticeSlug = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Send submission notification emails (prospect confirmation + practice notification)
 */
const sendSubmissionEmails = async (payload: {
  intake_id: string;
  organization_name: string;
  billing_email: string | null;
  client_email: string | null;
  client_name: string;
  amount: number;
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
    // Fetch full intake details for rich notification
    try {
      const [intake] = await db
        .select()
        .from(practiceClientIntakes)
        .where(eq(practiceClientIntakes.id, payload.intake_id))
        .limit(1);

      const intakeMetadata = (intake?.metadata as PracticeClientIntakeMetadata) || {};

      // Use practice service name if available, fallback to description
      const practiceServiceName =
        (intakeMetadata as any).practice_service_name ||
        intakeMetadata.description?.substring(0, 50) ||
        'General inquiry';

      // Format submission time
      const submittedAt = intake?.created_at
        ? new Date(intake.created_at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'Recently';

      // Format court date if present
      const courtDate = intake?.court_date
        ? new Date(intake.court_date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : undefined;

      // Generate action URLs (these would be signed URLs in production)
      const baseUrl = config.app.frontendUrls[0] || config.app.appUrl;
      const normalizedPracticeSlug = normalizePracticeSlug(payload.organization_name || '');
      const practiceSlug = normalizedPracticeSlug.length >= 3 ? normalizedPracticeSlug : '';
      const practiceIntakeUrl = practiceSlug
        ? `${baseUrl}/practice/${practiceSlug}/intakes/${payload.intake_id}`
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
            // Enhanced decision-making fields
            urgency: intake?.urgency as 'routine' | 'time_sensitive' | 'emergency' | undefined,
            matterType: practiceServiceName, // Use practice service name
            jurisdiction: intakeMetadata.address?.state || 'Not specified',
            courtDate,
            hasDocuments: intake?.has_documents || false,
            caseStrength: intake?.case_strength || undefined,
            desiredOutcome: intake?.desired_outcome || undefined,
            opposingParty: intakeMetadata.opposing_party || undefined,
            submittedAt,
            intakeId: payload.intake_id,
            // Action URLs (in production these would be signed, expiring URLs)
            acceptUrl: `${practiceIntakeUrl}?action=accept`,
            declineUrl: `${practiceIntakeUrl}?action=decline`,
            conflictCheckUrl: `${practiceIntakeUrl}?action=conflict-check`,
            description: intakeMetadata.description, // Full description for hyperlink
          }
        )
        .catch((error: unknown) => {
          logError('Failed to queue intake new notification email', error, {
            intakeId: payload.intake_id,
          });
        });
    } catch (error) {
      logError('Failed to fetch intake details for notification', error, {
        intakeId: payload.intake_id,
      });

      // Fallback to basic notification
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
            intakeUrl: `${config.app.frontendUrls[0] || APP_URL}/dashboard/intakes/${payload.intake_id}`,
            practiceName: payload.organization_name,
          }
        )
        .catch((notificationError: unknown) => {
          logError('Failed to queue fallback intake notification email', notificationError, {
            intakeId: payload.intake_id,
          });
        });
    }
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
