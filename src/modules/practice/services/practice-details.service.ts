/**
 * Practice Details Service
 *
 * Handles business logic for practice details operations
 */

import { eq } from 'drizzle-orm';
import { omit } from 'es-toolkit/compat';
import {
  findPracticeDetailsByOrganization,
} from '@/modules/practice/database/queries/practice-details.repository';
import { getFullOrganization } from '@/modules/practice/services/organization.service';
import { db } from '@/shared/database';
import { organizations } from '@/schema/better-auth-schema';
import { EventType } from '@/shared/events/enums/event-types';
import { publishEventTx } from '@/shared/events/event-publisher';
import type { User } from '@/shared/types/BetterAuth';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';
import { practiceDetails as practiceDetailsTable } from '@/modules/practice/database/schema/practice.schema';
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
  const fetchedDetails = await findPracticeDetailsByOrganization(organizationId);

  if (!fetchedDetails) {
    return null;
  }

  // Fetch address if linked
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

  // Upsert practice details within transaction with event publishing
  // Address operations are now inside the transaction to ensure atomicity
  const practiceDetailsResult = await db.transaction(async (tx) => {
    // Handle address update/create inside transaction
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
        const [updatedAddress] = await tx
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
        const [address] = await tx
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
      const [fetchedAddress] = await tx
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

  // Clean and return
  return {
    ...omit(practiceDetailsResult.details, [
      'id',
      'organization_id',
      'user_id',
      'created_at',
      'updated_at',
    ]),
    address: practiceDetailsResult.addressResult,
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

  // Delete practice details within transaction with event publishing
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
  } else {
    // No practice details, just delete if they exist
    await db
      .delete(practiceDetailsTable)
      .where(eq(practiceDetailsTable.organization_id, organizationId));
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
  const fetchedDetails = await findPracticeDetailsByOrganization(organization.id);

  if (!fetchedDetails) {
    return null;
  }

  // Fetch address if linked
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

