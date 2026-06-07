import { eq } from 'drizzle-orm';
import { upsertAddressTx } from '@/modules/practice/database/queries/address.repository';
import { practiceServicesRepository } from '@/modules/practice/database/queries/practice-services.repository';
import {
  practiceDetails as practiceDetailsTable,
  type PracticeDetails,
} from '@/modules/practice/database/schema/practice.schema';
import type { AddressData } from '@/modules/practice/types/addresses.types';
import type {
  DetailsFieldKeys,
  UpsertDetailsTransactionParams,
} from '@/modules/practice/types/practice-management.types';
import { db } from '@/shared/database';
import { PracticeDetailsCreated, PracticeDetailsUpdated, PracticeDetailsDeleted } from '@/shared/events/definitions';
import type { ServiceContext } from '@/shared/types/service-context';

export const DETAILS_FIELD_KEYS: DetailsFieldKeys[] = [
  'business_phone',
  'business_email',
  'consultation_fee',
  'payment_url',
  'calendly_url',
  'billing_increment_minutes',
  'website',
  'intro_message',
  'overview',
  'is_public',
  'services',
  'supported_states',
  'service_states',
  'address',
  'accent_color',
];

export const upsertDetailsTransaction = async (
  tx: typeof db,
  ctx: ServiceContext,
  params: UpsertDetailsTransactionParams
) => {
  let addressId = params.existingAddressId;
  let addressResult: AddressData | null = null;

  if (params.data.address && Object.keys(params.data.address).length > 0) {
    const address = await upsertAddressTx({
      addressData: params.data.address,
      organizationId: params.organizationId,
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

  const detailsPayload = {
    business_phone: params.data.business_phone ?? undefined,
    business_email: params.data.business_email ?? undefined,
    consultation_fee: params.data.consultation_fee ?? undefined,
    payment_url: params.data.payment_url ?? undefined,
    calendly_url: params.data.calendly_url ?? undefined,
    billing_increment_minutes: params.data.billing_increment_minutes ?? undefined,
    website: params.data.website ?? undefined,
    intro_message: params.data.intro_message ?? undefined,
    overview: params.data.overview ?? undefined,
    is_public: params.data.is_public ?? undefined,
    accent_color: params.data.accent_color ?? undefined,
    supported_states: params.data.supported_states ?? undefined,
    service_states: params.data.service_states ?? undefined,
  };

  const updatePayload = { address_id: addressId, ...detailsPayload, updated_at: new Date() };
  const [updated] = await tx
    .update(practiceDetailsTable)
    .set(updatePayload)
    .where(eq(practiceDetailsTable.organization_id, params.organizationId))
    .returning();

  let details: PracticeDetails;
  let isCreated: boolean;
  if (updated) {
    details = updated;
    isCreated = false;
  } else {
    const [inserted] = await tx
      .insert(practiceDetailsTable)
      .values({
        organization_id: params.organizationId,
        user_id: params.userId,
        address_id: addressId,
        ...detailsPayload,
      })
      .onConflictDoNothing({
        target: practiceDetailsTable.organization_id,
      })
      .returning();

    if (inserted) {
      details = inserted;
      isCreated = true;
    } else {
      // Concurrent create won the race; treat this operation as update.
      const [raceUpdated] = await tx
        .update(practiceDetailsTable)
        .set(updatePayload)
        .where(eq(practiceDetailsTable.organization_id, params.organizationId))
        .returning();
      if (!raceUpdated) {
        throw new Error('Failed to upsert practice details');
      }
      details = raceUpdated;
      isCreated = false;
    }
  }

  const syncedServices =
    params.data.services !== undefined
      ? await practiceServicesRepository.syncServicesTx(tx, params.organizationId, params.data.services)
      : await practiceServicesRepository.findServicesByOrganization(params.organizationId);

  const EventClass = isCreated ? PracticeDetailsCreated : PracticeDetailsUpdated;
  await ctx.emit(EventClass, { practice_details_id: details.id, ...params.data });

  return { details, addressResult, syncedServices };
};

export const buildPracticeDetailsDeletedPayload = (existing: PracticeDetails) => ({
  practice_details_id: existing.id,
  business_phone: existing.business_phone,
  business_email: existing.business_email,
  consultation_fee: existing.consultation_fee,
  payment_url: existing.payment_url,
  calendly_url: existing.calendly_url,
});

export const findAndDeletePracticeDetails = async (
  ctx: ServiceContext,
  organizationId: string
): Promise<PracticeDetails | null> =>
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(practiceDetailsTable)
      .where(eq(practiceDetailsTable.organization_id, organizationId))
      .returning();

    if (!deleted) {
      return null;
    }

    await ctx.emit(PracticeDetailsDeleted, buildPracticeDetailsDeletedPayload(deleted));
    return deleted;
  });
