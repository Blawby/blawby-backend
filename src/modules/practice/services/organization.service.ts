import type {
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
  OrganizationRequestParams,
} from '@/modules/practice/types/practice.types';
import { createBetterAuthInstance, type BetterAuthInstance } from '@/shared/auth/better-auth';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';
import { db } from '@/shared/database';
import type {
  ActiveOrganization,
  Organization,
} from '@/shared/types/BetterAuth';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { forbidden, internalError, ok } from '@/shared/utils/result';

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
    { data, requestHeaders }: { data: CreateOrganizationRequest; requestHeaders: Record<string, string> },
    _ctx: ServiceContext,
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
        headers: requestHeaders,
      });

      if (!result) {
        return internalError<Organization>('Failed to create organization');
      }

      return ok<Organization>(result);
    } catch (error) {
      return internalError<Organization>(getBetterAuthErrorMessage(error, 'Failed to create organization'));
    }
  },

  /**
   * List organizations for a user
   */
  async listOrganizations(
    { requestHeaders }: { requestHeaders: Record<string, string> },
    _ctx: ServiceContext,
  ): Promise<Result<Organization[]>> {
    try {
      const betterAuth = getBetterAuth();
      const result = await betterAuth.api.listOrganizations({
        headers: requestHeaders,
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
    { organizationId, requestHeaders }: OrganizationRequestParams,
    _ctx: ServiceContext,
  ): Promise<Result<ActiveOrganization>> {
    const betterAuth = getBetterAuth();
    try {
      const result = await betterAuth.api.getFullOrganization({
        query: { organizationId },
        headers: requestHeaders,
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
    { data, requestHeaders }: { data: UpdateOrganizationRequest; requestHeaders: Record<string, string> },
    _ctx: ServiceContext,
  ): Promise<Result<Organization>> {
    const betterAuth = getBetterAuth();
    try {
      const result = await betterAuth.api.updateOrganization({
        body: data,
        headers: requestHeaders,
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
    { organizationId, requestHeaders }: OrganizationRequestParams,
    _ctx: ServiceContext,
  ): Promise<Result<Organization>> {
    try {
      const betterAuth = getBetterAuth();
      const result = await betterAuth.api.deleteOrganization({
        body: { organizationId },
        headers: requestHeaders,
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
    { organizationId, requestHeaders }: OrganizationRequestParams,
    _ctx: ServiceContext,
  ): Promise<Result<ActiveOrganization>> {
    try {
      const betterAuth = getBetterAuth();
      const result = await betterAuth.api.setActiveOrganization({
        body: { organizationId },
        headers: requestHeaders,
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
      return ok<boolean>(!!result.status);
    } catch {
      return ok<boolean>(false);
    }
  },
};

export default organizationService;
