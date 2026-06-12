import type { PracticeDetails } from '@/modules/practice/database/schema/practice.schema';
import type { Organization } from '@/modules/practice/types/organization.types';
import type { PracticeResponse } from '@/modules/practice/types/practice.types';
import type { Address } from '@/shared/validations/address';

export type PracticeServiceResponseItem = {
  id: string;
  name: string;
  key: string;
};

export interface PracticeSerializationInput {
  organization: Organization;
  details: PracticeDetails;
  services: PracticeServiceResponseItem[];
  address: Address | null;
}

const getLatestUpdatedAt = (organization: Organization, details: PracticeDetails): string => {
  const detailsUpdatedAt = details.updated_at;
  const latest =
    detailsUpdatedAt.getTime() > organization.updatedAt.getTime() ? detailsUpdatedAt : organization.updatedAt;

  return latest.toISOString();
};

export const serializePractice = ({
  organization,
  details,
  services,
  address,
}: PracticeSerializationInput): PracticeResponse => ({
  id: organization.id,
  slug: organization.slug,
  name: organization.name,
  logo: organization.logo,
  business_phone: details.business_phone,
  business_email: details.business_email,
  website: details.website,
  consultation_fee: details.consultation_fee,
  payment_url: details.payment_url,
  calendly_url: details.calendly_url,
  intro_message: details.intro_message,
  overview: details.overview,
  accent_color: details.accent_color,
  is_public: details.is_public,
  billing_increment_minutes: details.billing_increment_minutes,
  payment_link_enabled: organization.paymentLinkEnabled,
  services,
  supported_states: details.supported_states,
  address,
  created_at: organization.createdAt.toISOString(),
  updated_at: getLatestUpdatedAt(organization, details),
});
