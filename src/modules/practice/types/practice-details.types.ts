import type { z } from '@hono/zod-openapi';
import type { AddressData } from '@/modules/practice/types/addresses.types';
import type { PracticeDetailsResponse as PracticeDetailsApiResponse } from '@/modules/practice/types/practice.types';
import type { practiceValidations } from '@/modules/practice/validations/practice.validation';

export type PracticeDetailsResponse = PracticeDetailsApiResponse;

export type PracticeDetailsSupportedStates = Readonly<z.infer<typeof practiceValidations.supportedStatesItemSchema>>;

export interface UpsertPracticeDetailsRequest {
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
  services?: { id?: string; name: string; key: string }[];
  supported_states?: PracticeDetailsSupportedStates[];
  service_states?: string[];
  // Nested Address fields
  address?: AddressData;
}