import { getLogger } from '@logtape/logtape';
import {
  ConflictCheckCompleted,
  EngagementContractAccepted,
  EngagementContractDeclined,
  EngagementContractSent,
} from '@/shared/events/definitions/engagement-contracts';
import { Event } from '@/shared/events/event';
import { queueManager } from '@/shared/queue/queue.manager';
import { config } from '@/shared/config';
import { r2Service } from '@/shared/uploads/services/r2.service';
import { EMAIL_TEMPLATES } from '@/shared/services/email';
import { logError } from '@/shared/utils/logging';

const logger = getLogger(['engagement-contracts', 'listeners']);
const APP_URL = config.app.appUrl;

const getSignedContractDownloadUrl = async (signedPdfKey: string): Promise<string> => {
  if (!signedPdfKey) {
    logger.warn('getSignedContractDownloadUrl: no signedPdfKey provided, returning #');
    return '#';
  }

  const bucket = config.cloudflare.r2BucketName;
  if (bucket) {
    try {
      const presigned = await r2Service.generatePresignedDownloadUrl({
        bucket,
        key: signedPdfKey,
        expiresIn: 60 * 60 * 24,
      });

      if (presigned) {
        return presigned;
      }
    } catch (error: unknown) {
      logger.warn('getSignedContractDownloadUrl: presigned URL generation failed, falling back', {
        key: signedPdfKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (config.cloudflare.r2PublicUrl) {
    const base = config.cloudflare.r2PublicUrl.replace(/\/+$/, '');
    const key = signedPdfKey.replace(/^\/+/, '');
    return `${base}/${key}`;
  }

  logger.warn('getSignedContractDownloadUrl: no R2 bucket or public URL configured, returning #', {
    key: signedPdfKey,
  });
  return '#';
};

export const registerEngagementContractsListeners = (): void => {
  logger.info('Registering engagement-contracts event listeners...');

  Event.listen(EngagementContractSent, async (payload) => {
    if (!payload.client_email) {
      logger.info('Skipping engagement contract sent email: missing client email', {
        contractId: payload.contract_id,
      });
      return;
    }

    void queueManager
      .addEmailJob(
        EMAIL_TEMPLATES.ENGAGEMENT_CONTRACT_SENT,
        payload.client_email,
        `Your engagement contract from ${payload.practice_name}`,
        {
          recipientEmail: payload.client_email,
          recipientName: payload.client_name || 'Client',
          matterTitle: payload.matter_title,
          practiceName: payload.practice_name,
          reviewUrl: payload.review_url,
        }
      )
      .catch((error: unknown) => {
        logError('Failed to queue engagement-contract-sent email', error, {
          contractId: payload.contract_id,
        });
      });
  });

  Event.listen(EngagementContractAccepted, async (payload) => {
    const hasRecipient = payload.practice_email || payload.client_email;
    const signedContractUrl = hasRecipient ? await getSignedContractDownloadUrl(payload.signed_pdf_s3_key) : '#';

    if (payload.practice_email) {
      void queueManager
        .addEmailJob(
          EMAIL_TEMPLATES.ENGAGEMENT_CONTRACT_ACCEPTED,
          payload.practice_email,
          `Engagement contract accepted — ${payload.matter_title}`,
          {
            recipientEmail: payload.practice_email,
            recipientName: payload.practice_name,
            matterTitle: payload.matter_title,
            practiceName: payload.practice_name,
            clientName: payload.client_name || 'Client',
            signedContractUrl,
          }
        )
        .catch((error: unknown) => {
          logError('Failed to queue engagement-contract-accepted email', error, {
            contractId: payload.contract_id,
          });
        });
    }

    if (payload.client_email && signedContractUrl !== '#') {
      void queueManager
        .addEmailJob(
          EMAIL_TEMPLATES.ENGAGEMENT_CONTRACT_SIGNED_COPY,
          payload.client_email,
          `Your signed engagement contract — ${payload.practice_name}`,
          {
            recipientEmail: payload.client_email,
            recipientName: payload.client_name || 'Client',
            matterTitle: payload.matter_title,
            practiceName: payload.practice_name,
            signedContractUrl,
          }
        )
        .catch((error: unknown) => {
          logError('Failed to queue engagement-contract-signed-copy email', error, {
            contractId: payload.contract_id,
          });
        });
    } else if (payload.client_email) {
      logger.warn('Skipping signed-copy email: no valid contract download URL', {
        contractId: payload.contract_id,
      });
    }
  });

  Event.listen(EngagementContractDeclined, async (payload) => {
    if (!payload.practice_email) {
      return;
    }

    void queueManager
      .addEmailJob(
        EMAIL_TEMPLATES.ENGAGEMENT_CONTRACT_DECLINED,
        payload.practice_email,
        `Engagement contract declined — ${payload.matter_title}`,
        {
          recipientEmail: payload.practice_email,
          recipientName: payload.practice_name,
          matterTitle: payload.matter_title,
          practiceName: payload.practice_name,
          clientName: payload.client_name || 'Client',
        }
      )
      .catch((error: unknown) => {
        logError('Failed to queue engagement-contract-declined email', error, {
          contractId: payload.contract_id,
        });
      });
  });

  Event.listen(ConflictCheckCompleted, async (payload) => {
    const needsReview = payload.result_status === 'review_required' || payload.result_status === 'conflicted';
    if (!needsReview || !payload.practice_email) {
      return;
    }

    const reviewUrl = `${APP_URL}/dashboard/matters/${payload.matter_id}`;
    const resultStatus = payload.result_status === 'conflicted' ? 'conflicted' : 'review_required';
    void queueManager
      .addEmailJob(
        EMAIL_TEMPLATES.CONFLICT_CHECK_REVIEW_REQUIRED,
        payload.practice_email,
        `Conflict check review required — ${payload.practice_name}`,
        {
          recipientEmail: payload.practice_email,
          recipientName: payload.practice_name,
          practiceName: payload.practice_name,
          matterId: payload.matter_id,
          resultStatus,
          reviewUrl,
        }
      )
      .catch((error: unknown) => {
        logError('Failed to queue conflict-check-review-required email', error, {
          matterId: payload.matter_id,
        });
      });
  });

  logger.info('Engagement-contracts event listeners registered');
};
