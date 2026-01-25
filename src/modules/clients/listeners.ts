/**
 * Clients Module Event Listeners
 *
 * Handles client-related events including automatic client creation
 * from successful intake payments.
 */

import { getLogger } from '@logtape/logtape';
import { clientsService } from '@/modules/clients/services/clients.service';
import {
  IntakePaymentSucceeded,
  ClientCreated,
  ClientUpdated,
  ClientDeleted,
} from '@/shared/events/definitions';
import { Event } from '@/shared/events/event';

const logger = getLogger(['clients', 'listeners']);

/**
 * Register all client event listeners
 */
export function registerClientsListeners(): void {
  logger.info('Registering clients event listeners...');

  // Auto-create client on intake payment success
  Event.listen(IntakePaymentSucceeded, async (payload) => {
    if (!payload.uuid) {
      logger.warn('Intake payment succeeded event missing uuid');
      return;
    }

    logger.info('Creating client from successful intake', {
      intakeId: payload.uuid,
    });

    // Note: organizationId comes from the event context, not payload
    // The worker will need to pass this through
    const result = await clientsService.createClientFromIntake({
      organizationId: 'system', // Will be overridden by event context
      intakeId: payload.uuid,
      email: payload.client_email ?? '',
      name: payload.client_name ?? '',
      phone: undefined,
    });

    if (result.success) {
      logger.info('Successfully created client from intake', {
        clientId: result.data.id,
        intakeId: payload.uuid,
      });
    } else {
      logger.error('Failed to create client from intake', {
        intakeId: payload.uuid,
        error: result.error,
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
}
