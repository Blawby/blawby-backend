import { getLogger } from '@logtape/logtape';
import type {
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
  OrganizationRequestParams,
} from '@/modules/practice/types/practice.types';
import { createBetterAuthInstance, type BetterAuthInstance } from '@/shared/auth/better-auth';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';
import { db } from '@/shared/database';
import usersRepository from '@/shared/repositories/users.repository';
import type { ActiveOrganization, Organization } from '@/shared/types/BetterAuth';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { forbidden, internalError, ok } from '@/shared/utils/result';

const logger = getLogger(['practice', 'organization-service']);

// Lazy initialization - only create when needed (after env vars are loaded)
const getBetterAuth = (): BetterAuthInstance => createBetterAuthInstance(db);
const { getBetterAuthErrorMessage, isBetterAuthForbidden } = betterAuthUtils;

/**
 * Organization Service
 *
 * Wrapper for Better Auth organization management
 */
export const organizationService = {
  /**
   * Create a new organization
   */
  async createOrganization(
    { data }: { data: CreateOrganizationRequest },
    ctx: ServiceContext
  ): Promise<Result<Organization>> {
    try {
      const betterAuth = getBetterAuth();

      // Check slug availability
      const slugCheck = await betterAuth.api.checkOrganizationSlug({
        body: { slug: data.slug },
      });

      if (!slugCheck.status) {
        return forbidden<Organization>(`Organization slug '${data.slug}' is already taken`);
      }

      const result = await betterAuth.api.createOrganization({
        body: data,
        headers: ctx.requestHeaders,
      });

      if (!result) {
        return internalError<Organization>('Failed to create organization');
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

      return ok<Organization>(result);
    } catch (error) {
      return internalError<Organization>(getBetterAuthErrorMessage(error, 'Failed to create organization'));
    }
  },

  /**
   * List organizations for a user
   */
  async listOrganizations(ctx: ServiceContext): Promise<Result<Organization[]>> {
    try {
      const betterAuth = getBetterAuth();
      const result = await betterAuth.api.listOrganizations({
        headers: ctx.requestHeaders,
      });

      return ok<Organization[]>(Array.isArray(result) ? result : []);
    } catch (error) {
      return internalError<Organization[]>(getBetterAuthErrorMessage(error, 'Failed to list organizations'));
    }
  },

  /**
   * Get full organization details
   */
  async getFullOrganization(
    { organizationId }: OrganizationRequestParams,
    ctx: ServiceContext
  ): Promise<Result<ActiveOrganization>> {
    const betterAuth = getBetterAuth();
    try {
      const result = await betterAuth.api.getFullOrganization({
        query: { organizationId },
        headers: ctx.requestHeaders,
      });

      if (!result) {
        return forbidden<ActiveOrganization>('Organization not found or access denied');
      }

      return ok<ActiveOrganization>(result);
    } catch (error) {
      // Explicitly handle forbidden/unauthorized from better-auth
      if (isBetterAuthForbidden(error)) {
        return forbidden<ActiveOrganization>(getBetterAuthErrorMessage(error, 'Access denied to organization'));
      }

      return internalError<ActiveOrganization>(getBetterAuthErrorMessage(error, 'Failed to get organization details'));
    }
  },

  /**
   * Update organization details
   */
  async updateOrganization(
    { data }: { data: UpdateOrganizationRequest },
    ctx: ServiceContext
  ): Promise<Result<Organization>> {
    const betterAuth = getBetterAuth();
    try {
      const result = await betterAuth.api.updateOrganization({
        body: data,
        headers: ctx.requestHeaders,
      });

      if (!result) {
        return forbidden<Organization>('Organization not found or access denied');
      }

      return ok<Organization>(result);
    } catch (error) {
      return internalError<Organization>(getBetterAuthErrorMessage(error, 'Failed to update organization'));
    }
  },

  /**
   * Delete an organization
   */
  async deleteOrganization(
    { organizationId }: OrganizationRequestParams,
    ctx: ServiceContext
  ): Promise<Result<Organization>> {
    try {
      const betterAuth = getBetterAuth();
      const result = await betterAuth.api.deleteOrganization({
        body: { organizationId },
        headers: ctx.requestHeaders,
      });

      if (!result) {
        return forbidden<Organization>('Organization not found or access denied');
      }

      return ok<Organization>(result);
    } catch (error) {
      return internalError<Organization>(getBetterAuthErrorMessage(error, 'Failed to delete organization'));
    }
  },

  /**
   * Set the active organization for the current session
   */
  async setActiveOrganization(
    { organizationId }: OrganizationRequestParams,
    ctx: ServiceContext
  ): Promise<Result<ActiveOrganization>> {
    try {
      const betterAuth = getBetterAuth();
      const result = await betterAuth.api.setActiveOrganization({
        body: { organizationId },
        headers: ctx.requestHeaders,
      });

      if (!result) {
        return forbidden<ActiveOrganization>('Organization not found or access denied');
      }

      return ok<ActiveOrganization>(result);
    } catch (error) {
      return internalError<ActiveOrganization>(getBetterAuthErrorMessage(error, 'Failed to set active organization'));
    }
  },

  /**
   * Check if an organization slug is available
   */
  async checkOrganizationSlug(slug: string): Promise<Result<boolean>> {
    try {
      const betterAuth = getBetterAuth();
      const result = await betterAuth.api.checkOrganizationSlug({
        body: { slug },
      });
      return ok<boolean>(Boolean(result.status));
    } catch {
      return ok<boolean>(false);
    }
  },
};

export default organizationService;
