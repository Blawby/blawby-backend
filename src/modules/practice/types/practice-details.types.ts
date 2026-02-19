import { z } from '@hono/zod-openapi';
import type { PracticeDetails } from '@/modules/practice/database/schema/practice.schema';
import type { AddressData } from '@/modules/practice/types/addresses.types';
import { supportedStatesItemSchema } from '@/modules/practice/validations/practice.validation';

export type PracticeDetailsSupportedStates = Readonly<z.infer<typeof supportedStatesItemSchema>>;

export type PracticeDetailsResponse = Omit<
  PracticeDetails,
  'id' | 'organization_id' | 'user_id' | 'address_id' | 'created_at' | 'updated_at' | 'services'
> & {
  organization_id: string;
  address?: AddressData | null;
  services: Array<{ id: string; name: string; key: string }>;
  name?: string;
  logo?: string | null;
  payment_link_enabled?: boolean;
  payment_link_prefill_amount?: number;
  billing_increment_minutes?: number;
  supported_states?: PracticeDetailsSupportedStates[] | null;
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
  accent_color?: string | null;
  is_public?: boolean;
  billing_increment_minutes?: number;
  services?: Array<{ id?: string; name: string; key: string }>;
  supported_states?: PracticeDetailsSupportedStates[];
  // Nested Address fields
  address?: AddressData;
};
