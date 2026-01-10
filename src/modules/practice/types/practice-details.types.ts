import type { PracticeDetails } from '@/modules/practice/database/schema/practice.schema';
import type { AddressData } from '@/modules/practice/types/addresses.types';

export type PracticeDetailsResponse = Omit<
  PracticeDetails,
  'id' | 'organization_id' | 'user_id' | 'created_at' | 'updated_at'
> & {
  address?: AddressData | null;
};

export type UpsertPracticeDetailsRequest = {
  business_phone?: string | null;
  business_email?: string | null;
  consultation_fee?: number | null;
  payment_url?: string | null;
  calendly_url?: string | null;
  website?: string | null;
  intro_message?: string | null;
  overview?: string | null;
  is_public?: boolean;
  services?: Array<{ id: string; name: string }>;
  // Nested Address fields
  address?: AddressData;
};
