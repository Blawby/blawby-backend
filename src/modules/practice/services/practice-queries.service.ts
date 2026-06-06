import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { ForbiddenError } from '@casl/ability';

import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { organizationService } from '@/modules/practice/services/organization.service';
import {
  loadPracticeResponseById,
  loadPracticeResponsesForOrganizationIds,
} from '@/modules/practice/services/practice-response.loader';
import type { PracticeResponse, OrganizationRequestParams } from '@/modules/practice/types/practice.types';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['practice', 'queries-service']);

// --- Service ---

/**
 * Practice Queries Service
 *
 * Handles read-only operations for practices and their details
 */
export const practiceQueriesService = {
  /**
   * List all practices (organizations) for the current user
   */
  async listPractices(ctx: ServiceContext): Promise<{ practices: PracticeResponse[] }> {
    const organizations = await organizationService.listOrganizations(ctx);
    return {
      practices: await loadPracticeResponsesForOrganizationIds(organizations.map((organization) => organization.id)),
    };
  },

  /**
   * Get practice by ID with details (flat view)
   */
  async getPracticeById(
    { organizationId }: OrganizationRequestParams,
    ctx: ServiceContext
  ): Promise<{ practice: PracticeResponse }> {
    ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Organization');

    try {
      const practice = await loadPracticeResponseById(organizationId);
      if (!practice) {
        throw new HTTPException(404, { message: `Practice not found for '${organizationId}'` });
      }

      return { practice };
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      logger.error('Failed to get practice for {organizationId}: {error}', { organizationId, error });
      throw new HTTPException(500, { message: 'Failed to get practice details' });
    }
  },

  /**
   * Get full practice details (structured UI view)
   */
  async getPracticeDetails(
    { organizationId }: OrganizationRequestParams,
    ctx: ServiceContext
  ): Promise<PracticeResponse> {
    ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Organization');

    try {
      const practice = await loadPracticeResponseById(organizationId);
      if (!practice) {
        throw new HTTPException(404, { message: `Practice not found for '${organizationId}'` });
      }

      return practice;
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      logger.error('Failed to get practice details for {organizationId}: {error}', { organizationId, error });
      throw new HTTPException(500, { message: 'Failed to get practice details' });
    }
  },

  /**
   * Get practice details by slug (Public lookup)
   */
  async getPracticeBySlug({ slug }: { slug: string }, _ctx: ServiceContext): Promise<PracticeResponse> {
    try {
      // 1. Find organization by slug
      const slugResult = await organizationRepository.findBySlug(slug);

      if (!slugResult) {
        throw new HTTPException(404, { message: 'Practice not found' });
      }
      const organization = slugResult;

      const practice = await loadPracticeResponseById(organization.id);
      if (!practice || !practice.is_public) {
        throw new HTTPException(404, { message: 'Practice not found' });
      }

      return practice;
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      logger.error('Failed to get practice details for slug {slug}: {error}', { slug, error });
      throw new HTTPException(500, { message: 'Failed to get practice details' });
    }
  },
};
