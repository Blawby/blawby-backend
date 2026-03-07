import { eq } from 'drizzle-orm';
import { upsertAddressTx } from '@/modules/practice/database/queries/address.repository';
import {
  findPracticeDetailsByOrganization,
} from '@/modules/practice/database/queries/practice-details.repository';
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
import type {
  OrganizationApiShape,
  PracticeWithDetails,
} from '@/modules/practice/types/practice.types';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';
import { db } from '@/shared/database';
import {
  PracticeDetailsCreated,
  PracticeDetailsUpdated,
  PracticeDetailsDeleted,
} from '@/shared/events/definitions';
import type { ServiceContext } from '@/shared/types/service-context';

const { parseBetterAuthMetadata } = betterAuthUtils;

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
  'address',
  'accent_color',
];

export const buildPracticeWithDetails = (
  organization: OrganizationApiShape,
  practiceDetails: PracticeDetails | null,
): PracticeWithDetails => {
  const {
    paymentLinkEnabled,
    paymentLinkPrefillAmount,
    createdAt,
    updatedAt,
    ...rest
  } = organization;

  return {
    ...practiceDetails,
    ...rest,
    metadata: parseBetterAuthMetadata(organization.metadata),
    payment_link_enabled: paymentLinkEnabled ?? null,
    payment_link_prefill_amount: paymentLinkPrefillAmount ?? null,
    created_at: createdAt ?? new Date(),
    updated_at: updatedAt ?? undefined,
  };
};

export const upsertDetailsTransaction = async (
  tx: typeof db,
  ctx: ServiceContext,
  params: UpsertDetailsTransactionParams,
) => {
  let addressId = params.existingAddressId;
  let addressResult: AddressData | null = null;

  if (params.data.address && Object.keys(params.data.address).length > 0) {
    const address = await upsertAddressTx(tx, {
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
  };

  const [details] = await tx
    .insert(practiceDetailsTable)
    .values({
      organization_id: params.organizationId,
      user_id: params.userId,
      address_id: addressId,
      ...detailsPayload,
    })
    .onConflictDoUpdate({
      target: practiceDetailsTable.organization_id,
      set: { address_id: addressId, ...detailsPayload, updated_at: new Date() },
    })
    .returning();

  const syncedServices = params.data.services !== undefined
    ? await practiceServicesRepository.syncServicesTx(tx, params.organizationId, params.data.services)
    : await practiceServicesRepository.findServicesByOrganization(params.organizationId);

  const EventClass = params.isCreate ? PracticeDetailsCreated : PracticeDetailsUpdated;
  await ctx.emit(EventClass, { practice_details_id: details.id, ...params.data }, tx);

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

const deleteDetailsAndEmit = async (
  ctx: ServiceContext,
  tx: typeof db,
  organizationId: string,
  existing: PracticeDetails,
) => {
  await tx.delete(practiceDetailsTable).where(
    eq(practiceDetailsTable.organization_id, organizationId),
  );
  await ctx.emit(PracticeDetailsDeleted, buildPracticeDetailsDeletedPayload(existing), tx);
};

export const findAndDeletePracticeDetails = async (
  ctx: ServiceContext,
  organizationId: string,
): Promise<PracticeDetails | null> => {
  const existing = await findPracticeDetailsByOrganization(organizationId);
  if (!existing) return null;

  await db.transaction(async (tx) => {
    await deleteDetailsAndEmit(ctx, tx, organizationId, existing);
  });

  return existing;
};
