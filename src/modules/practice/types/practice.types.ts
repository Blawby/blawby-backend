import type { z } from 'zod';
import type { PracticeDetails } from '@/modules/practice/database/schema/practice.schema';
import type { BetterAuthInstance } from '@/shared/auth/better-auth';
import type { Organization, User } from '@/shared/types/BetterAuth';

// ============================================================================
// ORGANIZATION API TYPES
// ============================================================================

/**
 * Organization API request types inferred from Better Auth 1.4+
 *
 * Uses z.infer on the Zod schemas from endpoint options
 */
export type CreateOrganizationRequest = z.infer<
  BetterAuthInstance['api']['createOrganization']['options']['body']
>;

export type UpdateOrganizationRequest = z.infer<
  BetterAuthInstance['api']['updateOrganization']['options']['body']
>;

export type SetActiveOrganizationRequest = z.infer<
  BetterAuthInstance['api']['setActiveOrganization']['options']['body']
>;

export type CheckOrganizationSlugRequest = z.infer<
  BetterAuthInstance['api']['checkOrganizationSlug']['options']['body']
>;

export type GetFullOrganizationRequest = z.infer<
  NonNullable<BetterAuthInstance['api']['getFullOrganization']['options']['query']>
>;

export type DeleteOrganizationRequest = z.infer<
  BetterAuthInstance['api']['deleteOrganization']['options']['body']
>;

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
