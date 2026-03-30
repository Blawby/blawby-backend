/**
 * Matters Module Event Listeners
 *
 * Handles matter-related events for logging, history, and email notifications.
 * Pattern: Event → Listener → addEmailJob (outbox pattern)
 */

import { getLogger } from '@logtape/logtape';
import { matterStatusHistoryQueries } from '@/modules/matters/database/queries/matter-status-history.queries';
import { MatterCreated, MatterUpdated, MatterDeleted, MatterStatusChanged } from '@/shared/events/definitions';
import { RetainerLowBalance } from '@/shared/events/definitions/matters';
import { Event } from '@/shared/events/event';
import { queueManager } from '@/shared/queue/queue.manager';
import { EMAIL_TEMPLATES } from '@/shared/services/email';
import { config } from '@/shared/config';
import { logError } from '@/shared/utils/logging';

const logger = getLogger(['matters', 'listeners']);
const APP_URL = config.app.appUrl;

/**
 * Register all matter event listeners
 */
export const registerMattersListeners = (): void => {
  logger.info('Registering matters event listeners...');

  // Matter CRUD events
  Event.listen(MatterCreated, async (payload) => {
    logger.info('Matter created event received', { matterId: payload.matter_id });
  });

  Event.listen(MatterUpdated, async (payload) => {
    logger.info('Matter updated event received', { matterId: payload.matter_id });
  });

  Event.listen(MatterDeleted, async (payload) => {
    logger.info('Matter deleted event received', { matterId: payload.matter_id });
  });

  Event.listen(MatterStatusChanged, async (payload, context) => {
    logger.info('Matter status changed event received', {
      matterId: payload.matter_id,
      oldStatus: payload.old_status,
      newStatus: payload.new_status,
    });

    // Record status change in history table
    try {
      const metadata =
        context?.metadata && typeof context.metadata === 'object' && !Array.isArray(context.metadata)
          ? (context.metadata as unknown as Record<string, unknown>)
          : null;

      await matterStatusHistoryQueries.createMatterStatusHistory({
        matter_id: payload.matter_id,
        from_status: payload.old_status,
        to_status: payload.new_status,
        changed_by: context?.actorId ?? null,
        metadata,
      });
      logger.debug('Status history recorded', { matterId: payload.matter_id });
    } catch (error) {
      logger.error('Failed to record status history', {
        matterId: payload.matter_id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Send client-facing email for "active" (opened) and "closed" status transitions
    const isEmailableTransition = payload.new_status === 'active' || payload.new_status === 'closed';
    if (!isEmailableTransition) {
      return;
    }

    const clientEmail = payload.client_email;
    if (!clientEmail) {
      logger.info('No client email for matter status email, skipping', {
        matterId: payload.matter_id,
      });
      return;
    }

    const clientName = payload.client_name ?? 'Valued Client';
    const practiceName = payload.organization_name;

    if (payload.new_status === 'active') {
      void queueManager
        .addEmailJob(EMAIL_TEMPLATES.MATTER_OPENED, clientEmail, `Your matter has been opened — ${practiceName}`, {
          recipientEmail: clientEmail,
          recipientName: clientName,
          matterTitle: payload.matter_title,
          practiceName,
          dashboardUrl: `${APP_URL}/dashboard/matters/${payload.matter_id}`,
        })
        .catch((error: unknown) => {
          logError('Failed to queue matter opened email', error, {
            matterId: payload.matter_id,
          });
        });
    } else if (payload.new_status === 'closed') {
      void queueManager
        .addEmailJob(EMAIL_TEMPLATES.MATTER_CLOSED, clientEmail, `Your matter has been closed — ${practiceName}`, {
          recipientEmail: clientEmail,
          recipientName: clientName,
          matterTitle: payload.matter_title,
          practiceName,
        })
        .catch((error: unknown) => {
          logError('Failed to queue matter closed email', error, {
            matterId: payload.matter_id,
          });
        });
    }
  });

  // Retainer low balance alert
  Event.listen(RetainerLowBalance, async (payload) => {
    logger.warn(
      'Retainer balance below threshold for matter {matterId}: balance {currentBalance} < threshold {threshold}',
      {
        matterId: payload.matter_id,
        currentBalance: payload.current_balance,
        threshold: payload.threshold,
      }
    );
  });

  logger.info('Matter event listeners registered');
};
