/**
 * Clients Module Event Listeners
 *
 * Handles client-related events including automatic creation
 * from successful intake payments.
 */

import { getLogger } from '@logtape/logtape';
import { clientsCreationService } from '@/modules/clients/services/clients-creation.service';
import {
  IntakePaymentSucceeded,
  ClientCreated,
  ClientUpdated,
  ClientDeleted,
  InvitationAccepted,
} from '@/shared/events/definitions';
import { Event } from '@/shared/events/event';
import { createSystemContext } from '@/shared/types/service-context';

const logger = getLogger(['clients', 'listeners']);

/**
 * Register all client event listeners
 */
export const registerClientsListeners = (): void => {
  logger.info('Registering client event listeners...');

  // Auto-create client on intake payment success
  Event.listen(IntakePaymentSucceeded, async (payload, context) => {
    if (!payload.uuid) {
      logger.warn('Intake payment succeeded event missing uuid');
      return;
    }

    if (!payload.client_email) {
      logger.error('Intake payment succeeded event missing client_email');
      return;
    }

    const userId = payload.user_id;
    const organizationId = context?.organizationId ?? payload.organization_id;

    logger.info('Creating client from successful intake', {
      intakeId: payload.uuid,
      userId: userId ?? 'none',
    });

    const sysCtx = createSystemContext(organizationId);

    try {
      const client = await clientsCreationService.createClientFromIntake(
        {
          data: {
            intakeId: payload.uuid,
            userId,
            email: payload.client_email,
            name: payload.client_name ?? '',
            phone: undefined,
          },
        },
        sysCtx
      );

      logger.info('Successfully created client from intake', {
        clientId: client.id,
        intakeId: payload.uuid,
      });
    } catch (error) {
      logger.error('Failed to create client from intake', {
        intakeId: payload.uuid,
        error,
      });
    }
  });

  // Handle Invitation Accepted (for direct client invites)
  Event.listen(InvitationAccepted, async (payload) => {
    if (payload.role !== 'client') {
      return;
    }

    logger.info('Invitation accepted by client, creating client record', {
      userId: payload.userId,
      organizationId: payload.organizationId,
    });

    const sysCtx = createSystemContext(payload.organizationId);
    const DEFAULT_CLIENT_NAME = 'New Client';

    try {
      const client = await clientsCreationService.createClient(
        {
          data: {
            userId: payload.userId,
            name: DEFAULT_CLIENT_NAME,
            email: payload.email,
            status: 'active',
          },
        },
        sysCtx
      );

      logger.info('Successfully created client for invited client', {
        clientId: client.id,
        userId: payload.userId,
      });
    } catch (error) {
      logger.error('Failed to create client for invited client', {
        userId: payload.userId,
        error,
      });
    }
  });

  // Client CRUD events
  Event.listen(ClientCreated, async (payload) => {
    logger.info('Client created', { clientId: payload.client_id });
  });

  Event.listen(ClientUpdated, async (payload) => {
    logger.info('Client updated', { clientId: payload.client_id });
  });

  Event.listen(ClientDeleted, async (payload) => {
    logger.info('Client deleted', { clientId: payload.client_id });
  });

  logger.info('Client event listeners registered');
};
