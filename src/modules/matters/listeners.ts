/**
 * Matters Module Event Listeners
 *
 * Handles matter-related events for logging and business logic.
 */

import { getLogger } from '@logtape/logtape';
import {
  MatterCreated,
  MatterUpdated,
  MatterDeleted,
  MatterStatusChanged,
} from '@/shared/events/definitions';
import { Event } from '@/shared/events/event';

const logger = getLogger(['matters', 'listeners']);

/**
 * Register all matter event listeners
 */
export function registerMattersListeners(): void {
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

  Event.listen(MatterStatusChanged, async (payload) => {
    logger.info('Matter status changed event received', {
      matterId: payload.matter_id,
      oldStatus: payload.old_status,
      newStatus: payload.new_status,
    });
  });

  logger.info('Matter event listeners registered');
}
