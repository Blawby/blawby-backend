import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import type {
  ActiveOrganization,
  Organization,
  User,
} from '@/shared/types/BetterAuth';
import { Result, forbidden, internalError, ok } from '@/shared/types/result';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';


// Lazy initialization - only create when needed (after env vars are loaded)
const getBetterAuth = () => createBetterAuthInstance(db);
const { getBetterAuthErrorMessage, isBetterAuthForbidden } = betterAuthUtils;

export const createOrganization = async (
  data: any, // CreateOrganizationRequest
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<Organization>> => {
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
};

export const listOrganizations = async (
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<Organization[]>> => {
  try {
    const betterAuth = getBetterAuth();
    const result = await betterAuth.api.listOrganizations({
      headers: requestHeaders,
    });

    return ok(Array.isArray(result) ? result : []);
  } catch (error) {
    return internalError(getBetterAuthErrorMessage(error, 'Failed to list organizations'));
  }
};

export const getFullOrganization = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<ActiveOrganization>> => {
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
};

export const updateOrganization = async (
  data: any, // UpdateOrganizationRequest
  requestHeaders: Record<string, string>,
): Promise<Result<Organization>> => {
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
};

export const deleteOrganization = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<Organization>> => {
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
};

export const setActiveOrganization = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<ActiveOrganization>> => {
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
};

export const checkOrganizationSlug = async (
  slug: string,
): Promise<Result<boolean>> => {
  try {
    const betterAuth = getBetterAuth();
    const result = await betterAuth.api.checkOrganizationSlug({
      body: { slug },
    });
    return ok(!!result.status);
  } catch (error) {
    return ok(false); // If check fails, assume taken for safety or return error
  }
};
