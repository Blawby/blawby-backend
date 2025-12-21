/**
 * Practice Details Service
 *
 * Handles business logic for practice details operations
 */

import { omit } from 'es-toolkit/compat';
import {
  createPracticeDetails,
  findPracticeDetailsByOrganization,
  updatePracticeDetails,
  upsertPracticeDetails,
  deletePracticeDetails as deletePracticeDetailsQuery,
} from '@/modules/practice/database/queries/practice-details.repository';
import { getFullOrganization } from '@/modules/practice/services/organization.service';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import type { User } from '@/shared/types/BetterAuth';
import type { PracticeDetails } from '@/modules/practice/database/schema/practice.schema';

export type PracticeDetailsResponse = Omit<
  PracticeDetails,
  'id' | 'organization_id' | 'user_id' | 'created_at' | 'updated_at'
>;

/**
 * Get practice details for an organization
 */
export const getPracticeDetails = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<PracticeDetailsResponse | null> => {
  // Verify organization exists and user has access
  const organization = await getFullOrganization(
    organizationId,
    user,
    requestHeaders,
  );

  if (!organization) {
    throw new Error('Practice not found');
  }

  // Get practice details
  const practiceDetails = await findPracticeDetailsByOrganization(organizationId);

  if (!practiceDetails) {
    return null;
  }

  // Clean practice details (remove internal fields)
  return omit(practiceDetails, [
    'id',
    'organization_id',
    'user_id',
    'created_at',
    'updated_at',
  ]) as PracticeDetailsResponse;
};

/**
 * Create practice details for an organization
 */
export const createPracticeDetailsService = async (
  organizationId: string,
  data: {
    business_phone?: string | null;
    business_email?: string | null;
    consultation_fee?: number | null;
    payment_url?: string | null;
    calendly_url?: string | null;
  },
  user: User,
  requestHeaders: Record<string, string>,
): Promise<PracticeDetailsResponse> => {
  // Verify organization exists and user has access
  const organization = await getFullOrganization(
    organizationId,
    user,
    requestHeaders,
  );

  if (!organization) {
    throw new Error('Practice not found');
  }

  // Check if practice details already exist
  const existing = await findPracticeDetailsByOrganization(organizationId);
  if (existing) {
    throw new Error('Practice details already exist. Use PUT to update.');
  }

  // Create practice details
  const practiceDetails = await createPracticeDetails({
    organization_id: organizationId,
    user_id: user.id,
    business_phone: data.business_phone || null,
    business_email: data.business_email || null,
    consultation_fee: data.consultation_fee || null,
    payment_url: data.payment_url || null,
    calendly_url: data.calendly_url || null,
  });

  // Publish event
  void publishSimpleEvent(
    EventType.PRACTICE_DETAILS_CREATED,
    user.id,
    organizationId,
    {
      practice_details_id: practiceDetails.id,
      business_phone: data.business_phone,
      business_email: data.business_email,
      consultation_fee: data.consultation_fee,
      payment_url: data.payment_url,
      calendly_url: data.calendly_url,
    },
  );

  // Clean and return
  return omit(practiceDetails, [
    'id',
    'organization_id',
    'user_id',
    'created_at',
    'updated_at',
  ]) as PracticeDetailsResponse;
};

/**
 * Update practice details for an organization
 */
export const updatePracticeDetailsService = async (
  organizationId: string,
  data: {
    business_phone?: string | null;
    business_email?: string | null;
    consultation_fee?: number | null;
    payment_url?: string | null;
    calendly_url?: string | null;
  },
  user: User,
  requestHeaders: Record<string, string>,
): Promise<PracticeDetailsResponse> => {
  // Verify organization exists and user has access
  const organization = await getFullOrganization(
    organizationId,
    user,
    requestHeaders,
  );

  if (!organization) {
    throw new Error('Practice not found');
  }

  // Update practice details (upsert - creates if doesn't exist)
  const practiceDetails = await upsertPracticeDetails(organizationId, user.id, {
    business_phone: data.business_phone ?? undefined,
    business_email: data.business_email ?? undefined,
    consultation_fee: data.consultation_fee ?? undefined,
    payment_url: data.payment_url ?? undefined,
    calendly_url: data.calendly_url ?? undefined,
  });

  // Publish event
  void publishSimpleEvent(
    EventType.PRACTICE_DETAILS_UPDATED,
    user.id,
    organizationId,
    {
      practice_details_id: practiceDetails.id,
      business_phone: data.business_phone,
      business_email: data.business_email,
      consultation_fee: data.consultation_fee,
      payment_url: data.payment_url,
      calendly_url: data.calendly_url,
    },
  );

  // Clean and return
  return omit(practiceDetails, [
    'id',
    'organization_id',
    'user_id',
    'created_at',
    'updated_at',
  ]) as PracticeDetailsResponse;
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
  const organization = await getFullOrganization(
    organizationId,
    user,
    requestHeaders,
  );

  if (!organization) {
    throw new Error('Practice not found');
  }

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

