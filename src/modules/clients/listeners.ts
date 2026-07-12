/**
 * Clients Module Event Listeners
 *
 * Handles client-related events including automatic creation
 * from successful intake payments.
 */

import { getLogger } from '@logtape/logtape';
import { clientsService } from '@/modules/clients/services/clients-crud.service';
import { IntakePaymentSucceeded, ClientCreated, ClientUpdated, ClientDeleted } from '@/shared/events/definitions';
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

    // User_id is optional - if present, it's the anonymous user ID from the session
    const userId = payload.user_id;
    const organizationId = context?.organizationId ?? payload.organization_id;

    logger.info('Creating client from successful intake', {
      intakeId: payload.uuid,
      userId: userId ?? 'none',
    });

    const sysCtx = createSystemContext(organizationId);

    try {
      const result = await clientsService.createClientFromIntake(
        {
          data: {
            intakeId: payload.uuid,
            userId, // Optional - will use email lookup if not provided
            email: payload.client_email,
            name: payload.client_name ?? '',
            phone: undefined,
          },
        },
        sysCtx
      );

      logger.info('Successfully created client from intake', {
        clientId: result.id,
        intakeId: payload.uuid,
      });
    } catch (error) {
      logger.error('Failed to create client from intake', {
        intakeId: payload.uuid,
        error: error instanceof Error ? error.message : 'Unknown error',
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
