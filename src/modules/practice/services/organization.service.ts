import { createBetterAuthInstance, type BetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import type {
  ActiveOrganization,
  Organization,
  User,
} from '@/shared/types/BetterAuth';
import type { Result } from '@/shared/types/result';
import { forbidden, internalError, ok } from '@/shared/utils/result';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';

// Lazy initialization - only create when needed (after env vars are loaded)
const getBetterAuth = (): BetterAuthInstance => createBetterAuthInstance(db);
const { getBetterAuthErrorMessage, isBetterAuthForbidden } = betterAuthUtils;

/**
 * Organization Service
 */
export const organizationService = {
  /**
   * Create a new organization
   */
  async createOrganization(
    data: any, // CreateOrganizationRequest
    user: User,
    requestHeaders: Record<string, string>,
  ): Promise<Result<Organization>> {
    try {
      const betterAuth = getBetterAuth();

      // Check slug availability
      const slugCheck = await betterAuth.api.checkOrganizationSlug({
        body: { slug: data.slug },
      });

      if (!slugCheck.status) {
        return forbidden(`Organization slug '${data.slug}' is already taken`);
      }

      const result = await betterAuth.api.createOrganization({
        body: data,
        headers: requestHeaders,
      });

      if (!result) {
        return internalError('Failed to create organization');
      }

      return ok(result);
    } catch (error) {
      return internalError(getBetterAuthErrorMessage(error, 'Failed to create organization'));
    }
  },

  /**
   * List organizations for a user
   */
  async listOrganizations(
    user: User,
    requestHeaders: Record<string, string>,
  ): Promise<Result<Organization[]>> {
    try {
      const betterAuth = getBetterAuth();
      const result = await betterAuth.api.listOrganizations({
        headers: requestHeaders,
      });

      return ok(Array.isArray(result) ? result : []);
    } catch (error) {
      return internalError(getBetterAuthErrorMessage(error, 'Failed to list organizations'));
    }
  },

  /**
   * Get full organization details
   */
  async getFullOrganization(
    organizationId: string,
    user: User,
    requestHeaders: Record<string, string>,
  ): Promise<Result<ActiveOrganization>> {
    const betterAuth = getBetterAuth();
    try {
      const result = await betterAuth.api.getFullOrganization({
        query: { organizationId },
        headers: requestHeaders,
      });

      if (!result) {
        return forbidden('Organization not found or access denied');
      }

      return ok(result);
    } catch (error) {
      // Explicitly handle forbidden/unauthorized from better-auth
      if (isBetterAuthForbidden(error)) {
        return forbidden(getBetterAuthErrorMessage(error, 'Access denied to organization'));
      }

      return internalError(getBetterAuthErrorMessage(error, 'Failed to get organization details'));
    }
  },

  /**
   * Update organization details
   */
  async updateOrganization(
    data: any, // UpdateOrganizationRequest
    requestHeaders: Record<string, string>,
  ): Promise<Result<Organization>> {
    const betterAuth = getBetterAuth();
    try {
      const result = await betterAuth.api.updateOrganization({
        body: data,
        headers: requestHeaders,
      });

      if (!result) {
        return forbidden('Organization not found or access denied');
      }

      return ok(result);
    } catch (error) {
      return internalError(getBetterAuthErrorMessage(error, 'Failed to update organization'));
    }
  },

  /**
   * Delete an organization
   */
  async deleteOrganization(
    organizationId: string,
    user: User,
    requestHeaders: Record<string, string>,
  ): Promise<Result<Organization>> {
    try {
      const betterAuth = getBetterAuth();
      const result = await betterAuth.api.deleteOrganization({
        body: { organizationId },
        headers: requestHeaders,
      });

      if (!result) {
        return forbidden('Organization not found or access denied');
      }

      return ok(result);
    } catch (error) {
      return internalError(getBetterAuthErrorMessage(error, 'Failed to delete organization'));
    }
  },

  /**
   * Set the active organization for the current session
   */
  async setActiveOrganization(
    organizationId: string,
    user: User,
    requestHeaders: Record<string, string>,
  ): Promise<Result<ActiveOrganization>> {
    try {
      const betterAuth = getBetterAuth();
      const result = await betterAuth.api.setActiveOrganization({
        body: { organizationId },
        headers: requestHeaders,
      });

      if (!result) {
        return forbidden('Organization not found or access denied');
      }

      return ok(result);
    } catch (error) {
      return internalError(getBetterAuthErrorMessage(error, 'Failed to set active organization'));
    }
  },

  /**
   * Check if an organization slug is available
   */
  async checkOrganizationSlug(
    slug: string,
  ): Promise<Result<boolean>> {
    try {
      const betterAuth = getBetterAuth();
      const result = await betterAuth.api.checkOrganizationSlug({
        body: { slug },
      });
      return ok(!!result.status);
    } catch (error) {
      return ok(false);
    }
  },
};

export default organizationService;

// Legacy exports
export const createOrganization = organizationService.createOrganization;
export const listOrganizations = organizationService.listOrganizations;
export const getFullOrganization = organizationService.getFullOrganization;
export const updateOrganization = organizationService.updateOrganization;
export const deleteOrganization = organizationService.deleteOrganization;
export const setActiveOrganization = organizationService.setActiveOrganization;
export const checkOrganizationSlug = organizationService.checkOrganizationSlug;
