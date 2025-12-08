import type {
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
} from '@/modules/practice/types/practice.types';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import type {
  Organization,
  User,
  ActiveOrganization,
} from '@/shared/types/BetterAuth';

// Lazy initialization - only create when needed (after env vars are loaded)
const getBetterAuth = () => createBetterAuthInstance(db);

export const createOrganization = async (
  data: CreateOrganizationRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Organization | null> => {
  // Check if slug is available
  // Better Auth validates name and slug, but we check slug availability first
  const betterAuth = getBetterAuth();
  const slugCheck = await betterAuth.api.checkOrganizationSlug({
    body: { slug: data.slug },
  });

  if (!slugCheck.status) {
    throw new Error(`Organization slug '${data.slug}' is already taken`);
  }

  // Better Auth validates the data and returns the organization
  const result = await betterAuth.api.createOrganization({
    body: data,
    headers: requestHeaders,
  });

  return result;
};

export const listOrganizations = async (
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Organization[]> => {
  // Better Auth validates and returns the organizations array
  const betterAuth = getBetterAuth();
  const result = await betterAuth.api.listOrganizations({
    headers: requestHeaders,
  });

  // Better Auth returns the organizations array directly
  return Array.isArray(result) ? result : [];
};

export const getFullOrganization = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<ActiveOrganization> => {
  const betterAuth = getBetterAuth();
  const result = await betterAuth.api.getFullOrganization({
    query: { organizationId },
    headers: requestHeaders,
  });
  return result;
};

export const updateOrganization = async (
  organizationId: string,
  data: UpdateOrganizationRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Organization | null> => {
  const betterAuth = getBetterAuth();
  const result = await betterAuth.api.updateOrganization({
    body: {
      organizationId,
      data,
    },
    headers: requestHeaders,
  });

  return result;
};

export const deleteOrganization = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Organization | null> => {
  const betterAuth = getBetterAuth();
  const result = await betterAuth.api.deleteOrganization({
    body: { organizationId },
    headers: requestHeaders,
  });


  return result;
};

export const setActiveOrganization = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<ActiveOrganization | null> => {
  const betterAuth = getBetterAuth();
  const result = await betterAuth.api.setActiveOrganization({
    body: { organizationId },
    headers: requestHeaders,
  });

  return result;
};

export const checkOrganizationSlug = async (
  slug: string,
): Promise<boolean> => {
  const betterAuth = getBetterAuth();
  const result = await betterAuth.api.checkOrganizationSlug({
    body: { slug },
  });
  return result.status;
};
