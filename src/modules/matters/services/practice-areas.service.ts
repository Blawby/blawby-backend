/**
 * Practice Areas Service
 *
 * Handles business logic for practice areas operations
 */

import * as practiceAreasQueries from '../database/queries/practice-areas.queries';
import type { User } from '@/shared/types/BetterAuth';
import { getFullOrganization } from '@/modules/practice/services/organization.service';
import type {
  CreatePracticeAreaRequest,
  UpdatePracticeAreaRequest,
} from '@/modules/matters/types/matter.types';

/**
 * Create a practice area
 */
export const createPracticeArea = async (
  organizationId: string,
  data: CreatePracticeAreaRequest,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to organization
  await getFullOrganization(organizationId, user, requestHeaders);

  return await practiceAreasQueries.createPracticeArea({
    organization_id: organizationId,
    ...data,
  });
};

/**
 * Get practice area by ID
 */
export const getPracticeAreaById = async (
  organizationId: string,
  practiceAreaId: string,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to organization
  await getFullOrganization(organizationId, user, requestHeaders);

  const practiceArea = await practiceAreasQueries.findPracticeAreaById(practiceAreaId);

  if (!practiceArea || practiceArea.organization_id !== organizationId) {
    throw new Error('Practice area not found');
  }

  return practiceArea;
};

/**
 * List practice areas for an organization
 */
export const listPracticeAreas = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to organization
  await getFullOrganization(organizationId, user, requestHeaders);

  return await practiceAreasQueries.listPracticeAreasByOrganization(organizationId);
};

/**
 * Update practice area
 */
export const updatePracticeArea = async (
  organizationId: string,
  practiceAreaId: string,
  data: UpdatePracticeAreaRequest,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to organization and practice area exists
  await getPracticeAreaById(organizationId, practiceAreaId, user, requestHeaders);

  return await practiceAreasQueries.updatePracticeArea(practiceAreaId, data);
};

/**
 * Delete practice area
 */
export const deletePracticeArea = async (
  organizationId: string,
  practiceAreaId: string,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to organization and practice area exists
  await getPracticeAreaById(organizationId, practiceAreaId, user, requestHeaders);

  await practiceAreasQueries.deletePracticeArea(practiceAreaId);
};
