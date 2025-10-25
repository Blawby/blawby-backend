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

const betterAuth = createBetterAuthInstance(db);

export const createOrganization = async (
  data: CreateOrganizationRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Organization | null> => {
  if (!data.name) {
    throw new Error('Organization name is required');
  }

  if (!data.slug) {
    throw new Error('Organization slug is required');
  }


  // Check if slug is available
  const slugCheck = await betterAuth.api.checkOrganizationSlug({
    body: { slug: data.slug },
  });

  if (!slugCheck.status) {
    throw new Error(`Organization slug '${data.slug}' is already taken`);
  }

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
  console.log('listOrganizations called with user:', user.id);


  try {
    // Try to get organizations using the session
    const result = await betterAuth.api.listOrganizations({
      headers: requestHeaders,
    });


    // Better Auth returns the organizations array directly, not as result.organizations
    const organizations = Array.isArray(result) ? result : [];

    return organizations;
  } catch (error) {
    console.error('Error calling Better Auth listOrganizations:', error);
    return [];
  }
};

export const getFullOrganization = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<ActiveOrganization> => {
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
  const result = await betterAuth.api.setActiveOrganization({
    body: { organizationId },
    headers: requestHeaders,
  });

  return result;
};

export const checkOrganizationSlug = async (
  slug: string,
): Promise<boolean> => {
  const result = await betterAuth.api.checkOrganizationSlug({
    body: { slug },
  });
  return result.status;
};
