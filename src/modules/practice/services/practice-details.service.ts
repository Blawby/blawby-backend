import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { omit } from 'es-toolkit/compat';
import { upsertAddressTx } from '@/modules/practice/database/queries/address.repository';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import {
  findPracticeDetailsByOrganization,
} from '@/modules/practice/database/queries/practice-details.repository';
import { practiceServicesRepository } from '@/modules/practice/database/queries/practice-services.repository';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';
import { practiceDetails as practiceDetailsTable } from '@/modules/practice/database/schema/practice.schema';
import { getFullOrganization } from '@/modules/practice/services/organization.service';
import type { AddressData } from '@/modules/practice/types/addresses.types';
import type {
  PracticeDetailsResponse,
  UpsertPracticeDetailsRequest,
} from '@/modules/practice/types/practice-details.types';
import { db } from '@/shared/database';
import {
  PracticeDetailsCreated,
  PracticeDetailsUpdated,
  PracticeDetailsDeleted,
} from '@/shared/events/definitions';
import type { User } from '@/shared/types/BetterAuth';
import type { Result } from '@/shared/types/result';
import { ok, notFound, internalError } from '@/shared/utils/result';

const logger = getLogger(['practice', 'details-service']);

/**
 * Get practice details for an organization
 */
const getPracticeDetails = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<PracticeDetailsResponse>> => {
  try {
    // 1. Verify organization exists and user has access via Better Auth
    const organizationResult = await getFullOrganization(
      organizationId,
      user,
      requestHeaders,
    );

    if (!organizationResult.success) {
      return organizationResult;
    }

    // 2. Get practice details and services
    const [fetchedDetails, services] = await Promise.all([
      findPracticeDetailsByOrganization(organizationId),
      practiceServicesRepository.findServicesByOrganization(organizationId),
    ]);

    // 3. Fetch address if linked
    let addressData: AddressData | null = null;
    if (fetchedDetails?.address_id) {
      const [address] = await db
        .select()
        .from(addresses)
        .where(eq(addresses.id, fetchedDetails.address_id));

      if (address) {
        addressData = {
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          postal_code: address.postal_code,
          country: address.country,
        };
      }
    }

    // 4. Return combined data
    const responseData = {
      ...omit(fetchedDetails || {}, [
        'id',
        'user_id',
        'address_id',
        'created_at',
        'updated_at',
      ]),
      address: addressData,
      services: services.map((s) => ({ id: s.id, name: s.name, key: s.key })),
      is_public: fetchedDetails?.is_public ?? false,
    };

    return ok(responseData as unknown as PracticeDetailsResponse);
  } catch (error) {
    logger.error('Failed to get practice details for {organizationId}: {error}', { organizationId, error });
    return internalError('Failed to get practice details');
  }
};

/**
 * Upsert practice details (Create or Update)
 */
const upsertPracticeDetails = async (
  organizationId: string,
  data: UpsertPracticeDetailsRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<PracticeDetailsResponse>> => {
  try {
    // 1. Verify organization exists and user has access via Better Auth
    const orgResult = await getFullOrganization(
      organizationId,
      user,
      requestHeaders,
    );

    if (!orgResult.success) {
      return orgResult;
    }

    // 2. Check for existing details to get address_id
    const existing = await findPracticeDetailsByOrganization(organizationId);
    const isCreate = !existing;
    let addressId = existing?.address_id;

    // 3. Upsert within transaction
    const practiceDetailsResult = await db.transaction(async (tx) => {
      let addressResult: AddressData | null = null;
      if (data.address && Object.keys(data.address).length > 0) {
        const address = await upsertAddressTx(tx, {
          addressData: data.address,
          organizationId,
          addressId,
        });

        if (address) {
          addressId = address.id;
          addressResult = {
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            state: address.state,
            postal_code: address.postal_code,
            country: address.country,
          };
        }
      }

      const [details] = await tx
        .insert(practiceDetailsTable)
        .values({
          organization_id: organizationId,
          user_id: user.id,
          address_id: addressId,
          business_phone: data.business_phone ?? undefined,
          business_email: data.business_email ?? undefined,
          consultation_fee: data.consultation_fee ?? undefined,
          payment_url: data.payment_url ?? undefined,
          calendly_url: data.calendly_url ?? undefined,
          website: data.website ?? undefined,
          intro_message: data.intro_message ?? undefined,
          overview: data.overview ?? undefined,
          is_public: data.is_public ?? undefined,
        })
        .onConflictDoUpdate({
          target: practiceDetailsTable.organization_id,
          set: {
            address_id: addressId,
            business_phone: data.business_phone ?? undefined,
            business_email: data.business_email ?? undefined,
            consultation_fee: data.consultation_fee ?? undefined,
            payment_url: data.payment_url ?? undefined,
            calendly_url: data.calendly_url ?? undefined,
            website: data.website ?? undefined,
            intro_message: data.intro_message ?? undefined,
            overview: data.overview ?? undefined,
            is_public: data.is_public ?? undefined,
            updated_at: new Date(),
          },
        })
        .returning();

      // Sync services if provided
      const syncedServices = data.services !== undefined
        ? await practiceServicesRepository.syncServicesTx(
          tx,
          organizationId,
          data.services,
        )
        : await practiceServicesRepository.findServicesByOrganization(organizationId);

      const EventClass = isCreate ? PracticeDetailsCreated : PracticeDetailsUpdated;
      await EventClass.dispatch({
        practice_details_id: details.id,
        ...data,
      }, {
        actorId: user.id,
        actorType: 'user',
        organizationId,
        tx,
      });

      return { details, addressResult, syncedServices };
    });

    const responseData = {
      ...omit(practiceDetailsResult.details, [
        'id',
        'user_id',
        'address_id',
        'created_at',
        'updated_at',
      ]),
      address: practiceDetailsResult.addressResult,
      services: practiceDetailsResult.syncedServices.map((s) => ({ id: s.id, name: s.name, key: s.key })),
    };

    return ok(responseData as unknown as PracticeDetailsResponse);
  } catch (error) {
    logger.error('Failed to upsert practice details for {organizationId}: {error}', { organizationId, error });
    return internalError('Failed to save practice details');
  }
};

/**
 * Delete practice details for an organization
 */
const deletePracticeDetails = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<void>> => {
  try {
    // 1. Verify organization exists and user has access via Better Auth
    const orgResult = await getFullOrganization(
      organizationId,
      user,
      requestHeaders,
    );

    if (!orgResult.success) {
      return orgResult;
    }

    // 2. Get practice details before deletion
    const existing = await findPracticeDetailsByOrganization(organizationId);

    if (existing) {
      await db.transaction(async (tx) => {
        await tx
          .delete(practiceDetailsTable)
          .where(eq(practiceDetailsTable.organization_id, organizationId));

        await PracticeDetailsDeleted.dispatch({
          practice_details_id: existing.id,
          business_phone: existing.business_phone,
          business_email: existing.business_email,
          consultation_fee: existing.consultation_fee,
          payment_url: existing.payment_url,
          calendly_url: existing.calendly_url,
        }, {
          actorId: user.id,
          actorType: 'user',
          organizationId,
          tx,
        });
      });
    }

    return ok(undefined);
  } catch (error) {
    logger.error('Failed to delete practice details for {organizationId}: {error}', { organizationId, error });
    return internalError('Failed to delete practice details');
  }
};

/**
 * Get practice details by slug (Public)
 */
const getPracticeDetailsBySlug = async (
  slug: string,
): Promise<Result<PracticeDetailsResponse>> => {
  try {
    // 1. Find organization by slug (Public lookup, no better auth session needed)
    const slugResult = await organizationRepository.findBySlug(slug);

    if (!slugResult) {
      return notFound(`Organization with slug '${slug}' not found`);
    }
    const organization = slugResult;


    // 2. Get practice details and services
    const [fetchedDetails, services] = await Promise.all([
      findPracticeDetailsByOrganization(organization.id),
      practiceServicesRepository.findServicesByOrganization(organization.id),
    ]);

    if (!fetchedDetails) {
      return notFound(`Practice details not found for organization '${slug}'`);
    }

    // 3. Fetch address if linked
    let addressData: AddressData | null = null;
    if (fetchedDetails.address_id) {
      const [address] = await db
        .select()
        .from(addresses)
        .where(eq(addresses.id, fetchedDetails.address_id));

      if (address) {
        addressData = {
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          postal_code: address.postal_code,
          country: address.country,
        };
      }
    }

    // 4. Return data with organization details
    const responseData = {
      ...omit(fetchedDetails, [
        'id',
        'organization_id',
        'user_id',
        'address_id',
        'created_at',
        'updated_at',
      ]),
      organization_id: organization.id,
      address: addressData,
      services: services.map((s) => ({ id: s.id, name: s.name, key: s.key })),
      name: organization.name,
      logo: organization.logo,
      payment_link_enabled: organization.paymentLinkEnabled ?? false,
      payment_link_prefill_amount: organization.paymentLinkPrefillAmount ?? 0,
    };

    return ok(responseData as unknown as PracticeDetailsResponse);
  } catch (error) {
    logger.error('Failed to get practice details for slug {slug}: {error}', { slug, error });
    return internalError('Failed to get practice details');
  }
};

/**
 * Practice Details Service Object
 */
export const practiceDetailsService = {
  getPracticeDetails,
  upsertPracticeDetails,
  deletePracticeDetails,
  getPracticeDetailsBySlug,
};

export default practiceDetailsService;
