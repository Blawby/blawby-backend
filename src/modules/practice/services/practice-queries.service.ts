import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { ForbiddenError } from '@casl/ability';

import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { findPracticeDetailsByOrganization } from '@/modules/practice/database/queries/practice-details.repository';
import { practiceServicesRepository } from '@/modules/practice/database/queries/practice-services.repository';
import { addresses as addressesTable } from '@/modules/practice/database/schema/addresses.schema';
import { organizationService } from '@/modules/practice/services/organization.service';
import type { PracticeDetailsResponse } from '@/modules/practice/types/practice-details.types';
import type { PracticeWithDetails, OrganizationRequestParams } from '@/modules/practice/types/practice.types';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';
import { db } from '@/shared/database';
import type { Organization } from '@/shared/types/BetterAuth';
import type { ServiceContext } from '@/shared/types/service-context';
import type { Address } from '@/shared/validations/address';

const { parseBetterAuthMetadata } = betterAuthUtils;
const logger = getLogger(['practice', 'queries-service']);

// --- Local Helpers ---

const fetchAddressData = async (addressId: string | null): Promise<Address | null> => {
  if (!addressId) {
    return null;
  }

  const [address] = await db.select().from(addressesTable).where(eq(addressesTable.id, addressId));

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
  async listPractices(ctx: ServiceContext): Promise<{ practices: Organization[] }> {
    ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Organization');

    const result = await organizationService.listOrganizations(ctx);
    return { practices: result };
  },

  /**
   * Get practice by ID with details (flat view)
   */
  async getPracticeById(
    { organizationId }: OrganizationRequestParams,
    ctx: ServiceContext
  ): Promise<{ practice: PracticeWithDetails }> {
    ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Organization');

    try {
      const organization = await organizationRepository.findById(organizationId);
      if (!organization) {
        throw new HTTPException(404, { message: `Organization not found for '${organizationId}'` });
      }

      // 2. Get optional practice details
      const practiceDetails = await findPracticeDetailsByOrganization(organizationId);

      // 3. Clean and combine data
      const practice: PracticeWithDetails = {
        ...practiceDetails,
        ...organization,
        metadata: parseBetterAuthMetadata(organization.metadata),
        payment_link_enabled: organization.paymentLinkEnabled ?? null,
        created_at: organization.createdAt,
        updated_at: practiceDetails?.updated_at ?? undefined,
      };

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
  ): Promise<PracticeDetailsResponse> {
    ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Organization');

    try {
      // 1. Verify organization exists
      const organization = await organizationRepository.findById(organizationId);
      if (!organization) {
        throw new HTTPException(404, { message: `Organization not found for '${organizationId}'` });
      }

      // 2. Get practice details and services
      const [fetchedDetails, services] = await Promise.all([
        findPracticeDetailsByOrganization(organizationId),
        practiceServicesRepository.findServicesByOrganization(organizationId),
      ]);

      if (!fetchedDetails) {
        return {
          id: null,
          user_id: null,
          address_id: null,
          business_phone: null,
          business_email: null,
          consultation_fee: null,
          payment_url: null,
          calendly_url: null,
          website: null,
          intro_message: null,
          overview: null,
          accent_color: null,
          is_public: false,
          organization_id: organizationId,
          services: [],
          address: null,
          name: organization.name,
          logo: organization.logo ?? null,
          payment_link_enabled: organization.paymentLinkEnabled ?? false,
          billing_increment_minutes: 1,
          created_at: null,
          updated_at: undefined,
          supported_states: null,
          service_states: null,
        };
      }

      // 3. Fetch address if linked
      const addressData = await fetchAddressData(fetchedDetails.address_id);

      // 4. Build response
      const responseData: PracticeDetailsResponse = {
        ...fetchedDetails,
        organization_id: organizationId,
        address: addressData,
        services: services.map((s) => ({ id: s.id, name: s.name, key: s.key })),
        name: organization.name,
        logo: organization.logo ?? null,
        payment_link_enabled: organization?.paymentLinkEnabled ?? false,
      };

      return responseData;
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
  async getPracticeBySlug({ slug }: { slug: string }, _ctx: ServiceContext): Promise<PracticeDetailsResponse> {
    try {
      // 1. Find organization by slug
      const slugResult = await organizationRepository.findBySlug(slug);

      if (!slugResult) {
        throw new HTTPException(404, { message: `Organization with slug '${slug}' not found` });
      }
      const organization = slugResult;

      // 2. Get practice details and services
      const [fetchedDetails, services] = await Promise.all([
        findPracticeDetailsByOrganization(organization.id),
        practiceServicesRepository.findServicesByOrganization(organization.id),
      ]);

      if (!fetchedDetails || !fetchedDetails.is_public) {
        throw new HTTPException(404, { message: `Practice details not found for organization '${slug}'` });
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
      };

      return responseData;
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      logger.error('Failed to get practice details for slug {slug}: {error}', { slug, error });
      throw new HTTPException(500, { message: 'Failed to get practice details' });
    }
  },
};
