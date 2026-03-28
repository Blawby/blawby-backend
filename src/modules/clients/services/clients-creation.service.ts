/**
 * Client Creation Service - Barrel Export
 *
 * Re-exports from split creation services
 */

import { ensureClientMember } from '@/modules/clients/services/clients-creation.helpers';
import { clientsDirectCreationService } from '@/modules/clients/services/clients-direct-creation.service';
import { clientsIntakeCreationService } from '@/modules/clients/services/clients-intake-creation.service';

export const clientsCreationService = {
  createClient: clientsDirectCreationService.createClient,
  createClientFromIntake: clientsIntakeCreationService.createClientFromIntake,
  ensureClientMember,
};
