/**
 * Clients Module Event Handlers
 */

import { EventType } from '@/shared/events/enums/event-types';
import { subscribeToEvent } from '@/shared/events/event-consumer';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import { clientsService } from '@/modules/clients/services/clients.service';
import { getLogger } from '@logtape/logtape';

const logger = getLogger(['clients', 'events']);

export const registerClientEvents = (): void => {
  logger.info('Registering clients module event handlers...');

  // Auto-create client on intake payment success
  subscribeToEvent(EventType.INTAKE_PAYMENT_SUCCEEDED, async (event: BaseEvent) => {
    const { organizationId, payload } = event;

    if (!payload || !payload.uuid) {
      logger.warn('Intake payment succeeded event missing payload or uuid', { eventId: event.eventId });
      return;
    }

    logger.info('Creating client from successful intake {intakeId}', {
      intakeId: payload.uuid,
      organizationId
    });

    const result = await clientsService.createClientFromIntake({
      organizationId: organizationId || 'system',
      intakeId: payload.uuid as string,
      email: payload.client_email as string,
      name: payload.client_name as string,
      phone: payload.client_phone as string | undefined,
    });

    if (result.success) {
      logger.info('Successfully created client {clientId} from intake {intakeId}', {
        clientId: result.data.id,
        intakeId: payload.uuid as string
      });
    } else {
      logger.error('Failed to create client from intake {intakeId}: {error}', {
        intakeId: payload.uuid,
        error: result.error
      });
    }
  });

  // Client CRUD events
  subscribeToEvent(EventType.CLIENT_CREATED, async (event: BaseEvent) => {
    logger.info('Client created', { clientId: event.payload?.client_id, organizationId: event.organizationId });
  });

  subscribeToEvent(EventType.CLIENT_UPDATED, async (event: BaseEvent) => {
    logger.info('Client updated', { clientId: event.payload?.client_id, organizationId: event.organizationId });
  });

  subscribeToEvent(EventType.CLIENT_DELETED, async (event: BaseEvent) => {
    logger.info('Client deleted', { clientId: event.payload?.client_id, organizationId: event.organizationId });
  });

  logger.info('✅ Clients module event handlers registered');
};
