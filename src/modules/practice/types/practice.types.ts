import type { PracticeDetails } from '@/modules/practice/database/schema/practice.schema';
import type { BetterAuthInstance } from '@/shared/auth/better-auth';
import type { Organization, User } from '@/shared/types/BetterAuth';

// ============================================================================
// ORGANIZATION API TYPES
// ============================================================================

/**
 * Organization API request types inferred from Better Auth
 */
export type CreateOrganizationRequest = Parameters<
  BetterAuthInstance['api']['createOrganization']
>[0]['body'];
export type UpdateOrganizationRequest = Parameters<
  BetterAuthInstance['api']['updateOrganization']
>[0]['body'];
export type SetActiveOrganizationRequest = Parameters<
  BetterAuthInstance['api']['setActiveOrganization']
>[0]['body'];
export type CheckOrganizationSlugRequest = Parameters<
  BetterAuthInstance['api']['checkOrganizationSlug']
>[0]['body'];
export type GetFullOrganizationRequest = Parameters<
  BetterAuthInstance['api']['getFullOrganization']
>[0]['query'];
export type DeleteOrganizationRequest = Parameters<
  BetterAuthInstance['api']['deleteOrganization']
>[0]['body'];

// Using Better Auth types directly from the instance
export type PracticeWithDetails = Organization & Partial<PracticeDetails>;

export type PracticeWithUser = {
  practice: Organization;
  user: User;
  practice_details: Partial<PracticeDetails> | null;
};

export type PracticeStats = {
  totalClients: number;
  totalRevenue: number;
  totalInvoices: number;
  activeSubscriptions: number;
};

export type PracticeSummary = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  consultationFee: string | null;
  paymentUrl: string | null;
  calendlyUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PracticeCreateRequest = {
  name: string;
  slug: string;
  logo?: string;
  metadata?: Record<string, unknown>;
  business_phone?: string;
  business_email?: string;
  consultation_fee?: number;
  payment_url?: string;
  calendly_url?: string;
};

export type PracticeUpdateRequest = {
  name?: string;
  slug?: string;
  logo?: string;
  metadata?: Record<string, unknown>;
  business_phone?: string;
  business_email?: string;
  consultation_fee?: number;
  payment_url?: string;
  calendly_url?: string;
};
