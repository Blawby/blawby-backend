import type { UpsertPracticeDetailsRequest } from '@/modules/practice/types/practice-details.types';
import type {
  CreatePracticeRequest,
  OrganizationRequestParams,
  UpdatePracticeRequest,
} from '@/modules/practice/types/practice.types';

export type DetailsData = Partial<
  Pick<UpsertPracticeDetailsRequest,
    | 'business_phone' | 'business_email' | 'consultation_fee'
    | 'payment_url' | 'calendly_url' | 'billing_increment_minutes'
    | 'website' | 'intro_message' | 'overview'
    | 'is_public' | 'accent_color' | 'services' | 'supported_states' | 'address'
  >
>;

export type PracticeMutationData = CreatePracticeRequest | UpdatePracticeRequest;

export type DetailsFieldKeys
  = | 'business_phone'
  | 'business_email'
  | 'consultation_fee'
  | 'payment_url'
  | 'calendly_url'
  | 'billing_increment_minutes'
  | 'website'
  | 'intro_message'
  | 'overview'
  | 'is_public'
  | 'services'
  | 'supported_states'
  | 'address'
  | 'accent_color';

export type UpsertDetailsTransactionParams = {
  organizationId: string;
  userId: string;
  data: DetailsData;
  existingAddressId?: string | null;
  isCreate: boolean;
};

export type RequestHeadersParams = {
  requestHeaders: Record<string, string>;
};

export type CreatePracticeParams = RequestHeadersParams & {
  data: CreatePracticeRequest;
};

export type UpdatePracticeParams = OrganizationRequestParams & {
  data: UpdatePracticeRequest;
};

export type UpsertPracticeDetailsParams = OrganizationRequestParams & {
  data: UpsertPracticeDetailsRequest;
};
