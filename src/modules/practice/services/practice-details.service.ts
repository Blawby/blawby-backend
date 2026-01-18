import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { omit } from 'es-toolkit/compat';
import {
  findPracticeDetailsByOrganization,
} from '@/modules/practice/database/queries/practice-details.repository';
import { getFullOrganization } from '@/modules/practice/services/organization.service';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishEventTx } from '@/shared/events/event-publisher';
import type { User } from '@/shared/types/BetterAuth';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';
import { upsertAddressTx } from '@/modules/practice/database/queries/address.repository';
import { practiceDetails as practiceDetailsTable } from '@/modules/practice/database/schema/practice.schema';
import type {
  PracticeDetailsResponse,
  UpsertPracticeDetailsRequest,
} from '@/modules/practice/types/practice-details.types';
import type { AddressData } from '@/modules/practice/types/addresses.types';
import { Result, ok, forbidden, notFound, internalError } from '@/shared/types/result';

const logger = getLogger(['practice', 'details-service']);

/**
 * Get practice details for an organization
 */
export const getPracticeDetails = async (
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
    const organization = organizationResult.data;

    // 2. Get practice details
    const fetchedDetails = await findPracticeDetailsByOrganization(organizationId);

    if (!fetchedDetails) {
      // Return empty defaults if no details found yet
      return ok({
        address: null,
        address_id: null,
        business_email: null,
        business_phone: null,
        website: null,
        consultation_fee: null,
        payment_url: null,
        calendly_url: null,
        intro_message: null,
        overview: null,
        is_public: false,
        services: [],
      } as any);
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

    // 4. Return combined data
    return ok({
      ...omit(fetchedDetails, [
        'id',
        'organization_id',
        'user_id',
        'address_id',
        'created_at',
        'updated_at',
      ]),
      address: addressData,
      services: (fetchedDetails.services || []) as any,
    } as PracticeDetailsResponse);
  } catch (error) {
    logger.error('Failed to get practice details for {organizationId}: {error}', { organizationId, error });
    return internalError('Failed to get practice details');
  }
};

/**
 * Upsert practice details (Create or Update)
 */
export const upsertPracticeDetailsService = async (
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
    const organization = orgResult.data;

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
          services: data.services ?? undefined,
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
            services: data.services ?? undefined,
            updated_at: new Date(),
          },
        })
        .returning();

      await publishEventTx(tx, {
        type: isCreate ? EventType.PRACTICE_DETAILS_CREATED : EventType.PRACTICE_DETAILS_UPDATED,
        actorId: user.id,
        actorType: 'user',
        organizationId,
        payload: {
          practice_details_id: details.id,
          ...data,
        },
      });

      return { details, addressResult };
    });

    return ok({
      ...omit(practiceDetailsResult.details, [
        'id',
        'organization_id',
        'user_id',
        'address_id',
        'created_at',
        'updated_at',
      ]),
      address: practiceDetailsResult.addressResult,
      services: (practiceDetailsResult.details.services || []) as any,
    } as PracticeDetailsResponse);
  } catch (error) {
    logger.error('Failed to upsert practice details for {organizationId}: {error}', { organizationId, error });
    return internalError('Failed to save practice details');
  }
};

/**
 * Delete practice details for an organization
 */
export const deletePracticeDetailsService = async (
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
    const organization = orgResult.data;

    // 2. Get practice details before deletion
    const existing = await findPracticeDetailsByOrganization(organizationId);

    if (existing) {
      await db.transaction(async (tx) => {
        await tx
          .delete(practiceDetailsTable)
          .where(eq(practiceDetailsTable.organization_id, organizationId));

        await publishEventTx(tx, {
          type: EventType.PRACTICE_DETAILS_DELETED,
          actorId: user.id,
          actorType: 'user',
          organizationId,
          payload: {
            practice_details_id: existing.id,
            business_phone: existing.business_phone,
            business_email: existing.business_email,
            consultation_fee: existing.consultation_fee,
            payment_url: existing.payment_url,
            calendly_url: existing.calendly_url,
          },
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
export const getPracticeDetailsBySlug = async (
  slug: string,
): Promise<Result<PracticeDetailsResponse>> => {
  try {
    // 1. Find organization by slug (Public lookup, no better auth session needed)
    const slugResult = await organizationRepository.findBySlug(slug);

    if (!slugResult) {
      return notFound(`Organization with slug '${slug}' not found`);
    }
    const organization = slugResult;

    // 2. Get practice details
    const fetchedDetails = await findPracticeDetailsByOrganization(organization.id);

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

    // 4. Return data
    return ok({
      ...omit(fetchedDetails, [
        'id',
        'organization_id',
        'user_id',
        'address_id',
        'created_at',
        'updated_at',
      ]),
      address: addressData,
      services: (fetchedDetails.services || []) as any,
    } as PracticeDetailsResponse);
  } catch (error) {
    logger.error('Failed to get practice details for slug {slug}: {error}', { slug, error });
    return internalError('Failed to get practice details');
  }
};

