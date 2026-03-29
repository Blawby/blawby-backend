import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import type {
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
  OrganizationRequestParams,
} from '@/modules/practice/types/practice.types';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { createBetterAuthInstance, type BetterAuthInstance } from '@/shared/auth/better-auth';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';
import { db } from '@/shared/database';
import usersRepository from '@/shared/repositories/users.repository';
import type { ActiveOrganization, Organization } from '@/shared/types/BetterAuth';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['practice', 'organization-service']);

// Lazy initialization - only create when needed (after env vars are loaded)
const getBetterAuth = (): BetterAuthInstance => createBetterAuthInstance(db);
const { getBetterAuthErrorMessage } = betterAuthUtils;

/**
 * Organization Service
 *
 * Wrapper for Better Auth organization management
 */
export const organizationService = {
  /**
   * Create a new organization
   */
  async createOrganization({ data }: { data: CreateOrganizationRequest }, ctx: ServiceContext): Promise<Organization> {
    try {
      const betterAuth = getBetterAuth();

      // Check slug availability
      const slugCheck = await betterAuth.api.checkOrganizationSlug({
        body: { slug: data.slug },
      });

      if (!slugCheck.status) {
        throw new HTTPException(409, { message: `Organization slug '${data.slug}' is already taken` });
      }

      const result = await betterAuth.api.createOrganization({
        body: data,
        headers: ctx.requestHeaders,
      });

      if (!result) {
        throw new HTTPException(500, { message: 'Failed to create organization' });
      }

      // Enforce primaryWorkspace for the creator if they don't have one (best-effort)
      try {
        const user = await usersRepository.findById(ctx.userId);
        if (user && !user.primaryWorkspace) {
          try {
            await usersRepository.update(ctx.userId, { primaryWorkspace: 'practice' });
          } catch (updateError) {
            logger.warn('Failed to set primaryWorkspace to "practice" for user {userId} after org creation', {
              userId: ctx.userId,
              error: updateError,
            });
          }
        }
      } catch (fetchError) {
        logger.warn('Failed to fetch user to set primaryWorkspace to "practice" after org creation', {
          userId: ctx.userId,
          error: fetchError,
        });
      }

      return result;
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: getBetterAuthErrorMessage(error, 'Failed to create organization') });
    }
  },

  /**
   * List organizations for a user
   */
  async listOrganizations(ctx: ServiceContext): Promise<Organization[]> {
    try {
      const betterAuth = getBetterAuth();
      const result = await betterAuth.api.listOrganizations({
        headers: ctx.requestHeaders,
      });

      return Array.isArray(result) ? result : [];
    } catch (error) {
      throw new HTTPException(500, { message: getBetterAuthErrorMessage(error, 'Failed to list organizations') });
    }
  },

  /**
   * Update organization details
   */
  async updateOrganization({ data }: { data: UpdateOrganizationRequest }, ctx: ServiceContext): Promise<Organization> {
    const betterAuth = getBetterAuth();
    try {
      // First check if organization exists (404) vs access denied (403)
      if (!data.organizationId) {
        throw new HTTPException(400, { message: 'Organization ID is required' });
      }
      const existingOrg = await organizationRepository.findById(data.organizationId);
      if (!existingOrg) {
        throw new HTTPException(404, { message: 'Organization not found' });
      }

      const result = await betterAuth.api.updateOrganization({
        body: data,
        headers: ctx.requestHeaders,
      });

      if (!result) {
        throw new HTTPException(403, { message: 'Access denied' });
      }

      return result;
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: getBetterAuthErrorMessage(error, 'Failed to update organization') });
    }
  },

  /**
   * Delete an organization
   */
  async deleteOrganization({ organizationId }: OrganizationRequestParams, ctx: ServiceContext): Promise<Organization> {
    try {
      const betterAuth = getBetterAuth();
      const result = await betterAuth.api.deleteOrganization({
        body: { organizationId },
        headers: ctx.requestHeaders,
      });

      if (!result) {
        throw new HTTPException(403, { message: 'Organization not found or access denied' });
      }

      return result;
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: getBetterAuthErrorMessage(error, 'Failed to delete organization') });
    }
  },

  /**
   * Set the active organization for the current session
   */
  async setActiveOrganization(
    { organizationId }: OrganizationRequestParams,
    ctx: ServiceContext
  ): Promise<ActiveOrganization> {
    try {
      const betterAuth = getBetterAuth();
      const result = await betterAuth.api.setActiveOrganization({
        body: { organizationId },
        headers: ctx.requestHeaders,
      });

      if (!result) {
        throw new HTTPException(403, { message: 'Organization not found or access denied' });
      }

      return result;
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: getBetterAuthErrorMessage(error, 'Failed to set active organization') });
    }
  },

  /**
   * Check if an organization slug is available
   */
  async checkOrganizationSlug(slug: string): Promise<boolean> {
    try {
      const betterAuth = getBetterAuth();
      const result = await betterAuth.api.checkOrganizationSlug({
        body: { slug },
      });
      return Boolean(result.status);
    } catch (error) {
      logger.error('Failed to check organization slug {slug}: {error}', {
        slug,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  },
};

export default organizationService;
