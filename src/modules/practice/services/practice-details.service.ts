/**
 * Practice Details Service
 *
 * Handles business logic for practice details operations
 */

import { eq } from 'drizzle-orm';
import { omit } from 'es-toolkit/compat';
import {
  findPracticeDetailsByOrganization,
  upsertPracticeDetails,
  deletePracticeDetails as deletePracticeDetailsQuery,
} from '@/modules/practice/database/queries/practice-details.repository';
import { getFullOrganization } from '@/modules/practice/services/organization.service';
import { db } from '@/shared/database';
import { organizations } from '@/schema/better-auth-schema';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import type { User } from '@/shared/types/BetterAuth';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';
import type {
  PracticeDetailsResponse,
  UpsertPracticeDetailsRequest,
} from '@/modules/practice/types/practice-details.types';
import type { AddressData } from '@/modules/practice/types/addresses.types';

/**
 * Get practice details for an organization
 */
export const getPracticeDetails = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<PracticeDetailsResponse | null> => {
  // Verify organization exists and user has access
  await getFullOrganization(
    organizationId,
    user,
    requestHeaders,
  );

  // Get practice details
  const practiceDetails = await findPracticeDetailsByOrganization(organizationId);

  if (!practiceDetails) {
    return null;
  }

  // Fetch address if linked
  let addressData: AddressData | null = null;
  if (practiceDetails.address_id) {
    const [address] = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, practiceDetails.address_id));

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

  // Clean practice details (remove internal fields)
  return {
    ...omit(practiceDetails, [
      'id',
      'organization_id',
      'user_id',
      'created_at',
      'updated_at',
    ]),
    address: addressData,
  };
};

/**
 * Upsert practice details (Create or Update)
 */
export const upsertPracticeDetailsService = async (
  organizationId: string,
  data: UpsertPracticeDetailsRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<PracticeDetailsResponse> => {
  // Verify organization exists and user has access
  await getFullOrganization(
    organizationId,
    user,
    requestHeaders,
  );

  // Check for existing details to get address_id if it exists
  const existing = await findPracticeDetailsByOrganization(organizationId);
  const isCreate = !existing;
  let addressId = existing?.address_id;

  // Handle address update/create
  let addressResult: AddressData | null = null;

  if (data.address && Object.keys(data.address).length > 0) {
    const addressData = {
      line1: data.address.line1,
      line2: data.address.line2,
      city: data.address.city,
      state: data.address.state,
      postal_code: data.address.postal_code,
      country: data.address.country,
    };

    if (addressId) {
      // Update existing address
      const [updatedAddress] = await db
        .update(addresses)
        .set({ ...addressData, updated_at: new Date() })
        .where(eq(addresses.id, addressId))
        .returning();

      if (updatedAddress) {
        addressResult = {
          line1: updatedAddress.line1,
          line2: updatedAddress.line2,
          city: updatedAddress.city,
          state: updatedAddress.state,
          postal_code: updatedAddress.postal_code,
          country: updatedAddress.country,
        };
      }

    } else {
      // Create new address
      const [address] = await db
        .insert(addresses)
        .values({
          organization_id: organizationId,
          type: 'practice_location',
          ...addressData,
        })
        .returning();
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
  } else if (addressId) {
    // If no address data provided in update but addressId exists, we return existing
    const [fetchedAddress] = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, addressId));

    if (fetchedAddress) {
      addressResult = {
        line1: fetchedAddress.line1,
        line2: fetchedAddress.line2,
        city: fetchedAddress.city,
        state: fetchedAddress.state,
        postal_code: fetchedAddress.postal_code,
        country: fetchedAddress.country,
      };
    }
  }

  // Upsert practice details
  const practiceDetails = await upsertPracticeDetails(organizationId, user.id, {
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
  });

  // Publish event
  if (isCreate) {
    void publishSimpleEvent(
      EventType.PRACTICE_DETAILS_CREATED,
      user.id,
      organizationId,
      {
        practice_details_id: practiceDetails.id,
        ...data,
      },
    );
  } else {
    void publishSimpleEvent(
      EventType.PRACTICE_DETAILS_UPDATED,
      user.id,
      organizationId,
      {
        practice_details_id: practiceDetails.id,
        ...data,
      },
    );
  }

  // Clean and return
  return {
    ...omit(practiceDetails, [
      'id',
      'organization_id',
      'user_id',
      'created_at',
      'updated_at',
    ]),
    address: addressResult,
  };
};

/**
 * Delete practice details for an organization
 */
export const deletePracticeDetailsService = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<void> => {
  // Verify organization exists and user has access
  await getFullOrganization(
    organizationId,
    user,
    requestHeaders,
  );

  // Get practice details before deletion for event
  const existing = await findPracticeDetailsByOrganization(organizationId);

  // Delete practice details
  await deletePracticeDetailsQuery(db, organizationId);

  // Publish event if details existed
  if (existing) {
    void publishSimpleEvent(
      EventType.PRACTICE_DETAILS_DELETED,
      user.id,
      organizationId,
      {
        practice_details_id: existing.id,
        business_phone: existing.business_phone,
        business_email: existing.business_email,
        consultation_fee: existing.consultation_fee,
        payment_url: existing.payment_url,
        calendly_url: existing.calendly_url,
      },
    );
  }
};

/**
 * Get practice details by slug (Public)
 */
export const getPracticeDetailsBySlug = async (
  slug: string,
): Promise<PracticeDetailsResponse | null> => {
  // Find organization by slug
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug));

  if (!organization) {
    return null;
  }

  // Get practice details
  const practiceDetails = await findPracticeDetailsByOrganization(organization.id);

  if (!practiceDetails) {
    return null;
  }

  // Fetch address if linked
  let addressData: AddressData | null = null;
  if (practiceDetails.address_id) {
    const [address] = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, practiceDetails.address_id));

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

  // Clean practice details (remove internal fields)
  return {
    ...omit(practiceDetails, [
      'id',
      'organization_id',
      'user_id',
      'created_at',
      'updated_at',
    ]),
    address: addressData,
  };
};

