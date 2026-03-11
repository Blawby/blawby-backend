import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import {
  findPracticeDetailsByOrganization,
} from '@/modules/practice/database/queries/practice-details.repository';
import { practiceServicesRepository } from '@/modules/practice/database/queries/practice-services.repository';
import { addresses as addressesTable } from '@/modules/practice/database/schema/addresses.schema';
import { organizationService } from '@/modules/practice/services/organization.service';
import type { PracticeDetailsResponse } from '@/modules/practice/types/practice-details.types';
import type {
  PracticeWithDetails,
  OrganizationRequestParams,
} from '@/modules/practice/types/practice.types';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';
import { db } from '@/shared/database';
import type { Organization } from '@/shared/types/BetterAuth';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { forbidden, ok, internalError, notFound } from '@/shared/utils/result';
import type { Address } from '@/shared/validations/address';

const { parseBetterAuthMetadata } = betterAuthUtils;
const logger = getLogger(['practice', 'queries-service']);

// --- Local Helpers ---

const fetchAddressData = async (addressId: string | null): Promise<Address | null> => {
  if (!addressId) return null;

  const [address] = await db
    .select()
    .from(addressesTable)
    .where(eq(addressesTable.id, addressId));

  if (address) {
    return {
      line1: address.line1 ?? undefined,
      line2: address.line2 ?? undefined,
      city: address.city ?? undefined,
      state: address.state ?? undefined,
      postal_code: address.postal_code ?? undefined,
      country: address.country ?? undefined,
    };
  }
  return null;
};

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
  async listPractices(
    ctx: ServiceContext,
  ): Promise<Result<{ practices: Organization[] }>> {
    if (ctx.ability.cannot('read', 'Organization')) {
      return forbidden('You do not have permission to read practices');
    }

    const result = await organizationService.listOrganizations(ctx);
    if (!result.success) return result;
    return ok<{ practices: Organization[] }>({ practices: result.data });
  },

  /**
   * Get practice by ID with details (flat view)
   */
  async getPracticeById(
    { organizationId }: OrganizationRequestParams,
    ctx: ServiceContext,
  ): Promise<Result<{ practice: PracticeWithDetails }>> {
    if (ctx.ability.cannot('read', 'Organization')) {
      return forbidden('You do not have permission to read this practice');
    }

    try {
      // 1. Get organization from Better Auth
      const orgResult = await organizationService.getFullOrganization(
        { organizationId },
        ctx,
      );

      if (!orgResult.success) {
        return orgResult;
      }

      const organization = orgResult.data;
      const storedOrganization = await organizationRepository.findById(organizationId);

      // 2. Get optional practice details
      const practiceDetails = await findPracticeDetailsByOrganization(organizationId);

      // 3. Clean and combine data
      const practice: PracticeWithDetails = {
        ...practiceDetails,
        ...organization,
        metadata: parseBetterAuthMetadata(orgResult.data.metadata),
        payment_link_enabled: storedOrganization?.paymentLinkEnabled ?? null,
        payment_link_prefill_amount: storedOrganization?.paymentLinkPrefillAmount ?? null,
        created_at: orgResult.data.createdAt,
        updated_at: practiceDetails?.updated_at ?? undefined,
      };

      return ok<{ practice: PracticeWithDetails }>({ practice });
    } catch (error) {
      logger.error('Failed to get practice for {organizationId}: {error}', { organizationId, error });
      return internalError<{ practice: PracticeWithDetails }>('Failed to get practice details');
    }
  },

  /**
   * Get full practice details (structured UI view)
   */
  async getPracticeDetails(
    { organizationId }: OrganizationRequestParams,
    ctx: ServiceContext,
  ): Promise<Result<PracticeDetailsResponse>> {
    if (ctx.ability.cannot('read', 'Organization')) {
      return forbidden('You do not have permission to read practice details');
    }

    try {
      // 1. Verify organization exists and user has access via Better Auth
      const organizationResult = await organizationService.getFullOrganization(
        { organizationId },
        ctx,
      );

      if (!organizationResult.success) {
        return organizationResult;
      }

      // 2. Get organization with custom fields from repository
      const organization = await organizationRepository.findById(organizationId);

      // 3. Get practice details and services
      const [fetchedDetails, services] = await Promise.all([
        findPracticeDetailsByOrganization(organizationId),
        practiceServicesRepository.findServicesByOrganization(organizationId),
      ]);

      if (!fetchedDetails) {
        return notFound<PracticeDetailsResponse>(
          `Practice details not found for organization '${organizationId}'`,
        );
      }

      // 4. Fetch address if linked
      const addressData = await fetchAddressData(fetchedDetails.address_id);

      // 5. Build response
      const responseData: PracticeDetailsResponse = {
        ...fetchedDetails,
        organization_id: organizationId,
        address: addressData,
        services: services.map((s) => ({ id: s.id, name: s.name, key: s.key })),
        name: organizationResult.data.name,
        logo: organizationResult.data.logo ?? null,
        payment_link_enabled: organization?.paymentLinkEnabled ?? false,
        payment_link_prefill_amount: organization?.paymentLinkPrefillAmount ?? 0,
      };

      return ok<PracticeDetailsResponse>(responseData);
    } catch (error) {
      logger.error('Failed to get practice details for {organizationId}: {error}', { organizationId, error });
      return internalError<PracticeDetailsResponse>('Failed to get practice details');
    }
  },

  /**
   * Get practice details by slug (Public lookup)
   */
  async getPracticeBySlug(
    { slug }: { slug: string },
    _ctx: ServiceContext,
  ): Promise<Result<PracticeDetailsResponse>> {
    try {
      // 1. Find organization by slug
      const slugResult = await organizationRepository.findBySlug(slug);

      if (!slugResult) {
        return notFound<PracticeDetailsResponse>(`Organization with slug '${slug}' not found`);
      }
      const organization = slugResult;

      // 2. Get practice details and services
      const [fetchedDetails, services] = await Promise.all([
        findPracticeDetailsByOrganization(organization.id),
        practiceServicesRepository.findServicesByOrganization(organization.id),
      ]);

      if (!fetchedDetails) {
        return notFound<PracticeDetailsResponse>(`Practice details not found for organization '${slug}'`);
      }
      if (!fetchedDetails.is_public) {
        return notFound<PracticeDetailsResponse>(`Practice details not found for organization '${slug}'`);
      }

      // 3. Fetch address if linked
      const addressData = await fetchAddressData(fetchedDetails.address_id);

      // 4. Return data with organization details
      const responseData: PracticeDetailsResponse = {
        ...fetchedDetails,
        organization_id: organization.id,
        address: addressData,
        services: services.map((s) => ({ id: s.id, name: s.name, key: s.key })),
        name: organization.name ?? '',
        logo: organization.logo ?? null,
        payment_link_enabled: organization.paymentLinkEnabled ?? false,
        payment_link_prefill_amount: organization.paymentLinkPrefillAmount ?? 0,
      };

      return ok<PracticeDetailsResponse>(responseData);
    } catch (error) {
      logger.error('Failed to get practice details for slug {slug}: {error}', { slug, error });
      return internalError<PracticeDetailsResponse>('Failed to get practice details');
    }
  },
};
