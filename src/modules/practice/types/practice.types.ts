import { z } from 'zod';
import type { PracticeDetails } from '@/modules/practice/database/schema/practice.schema';
import type { BetterAuthInstance } from '@/shared/auth/better-auth';
import type { Organization, User } from '@/shared/types/BetterAuth';
import { practiceValidations } from '@/modules/practice/validations/practice.validation';

// ============================================================================
// ORGANIZATION API TYPES
// ============================================================================

/**
 * Organization API request types inferred from Better Auth 1.4+
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
export type OrganizationApiShape = Organization & {
  paymentLinkEnabled?: boolean | null;
  paymentLinkPrefillAmount?: number | null;
  createdAt?: Date;
  updatedAt?: Date | null;
};

type OrganizationWithoutCamelCase = Omit<OrganizationApiShape, 'paymentLinkEnabled' | 'paymentLinkPrefillAmount' | 'createdAt' | 'updatedAt'>;

export type NormalizedOrganization = OrganizationWithoutCamelCase & {
  payment_link_enabled: boolean | null;
  payment_link_prefill_amount: number | null;
  created_at: Date;
  updated_at: Date | undefined;
};

export type PracticeWithDetails = NormalizedOrganization & Partial<PracticeDetails>;

export type PracticeWithUser = {
  practice: NormalizedOrganization;
  user: User;
  practice_details: Partial<PracticeDetails> | null;
};

export type PracticeStats = {
  totalClients: number;
  totalRevenue: number;
  totalInvoices: number;
  activeSubscriptions: number;
};

// Inferred from Zod schemas
export type CreatePracticeRequest = z.infer<typeof practiceValidations.createPracticeSchema>;
export type UpdatePracticeRequest = z.infer<typeof practiceValidations.updatePracticeSchema>;
export type PracticeQueryParams = z.infer<typeof practiceValidations.practiceQuerySchema>;
export type UpdateMemberRoleRequest = z.infer<typeof practiceValidations.updateMemberRoleSchema>;
export type CreateInvitationRequest = z.infer<typeof practiceValidations.createInvitationSchema>;
export type CreatePracticeDetailsRequest = z.infer<typeof practiceValidations.createPracticeDetailsSchema>;
export type UpdatePracticeDetailsRequest = z.infer<typeof practiceValidations.updatePracticeDetailsSchema>;

export type PracticeResponse = z.infer<typeof practiceValidations.practiceResponseSchema>;
export type PracticeListResponse = z.infer<typeof practiceValidations.practiceListResponseSchema>;
export type PracticeDetailsResponse = z.infer<typeof practiceValidations.practiceDetailsResponseSchema>;
export type MemberListItem = z.infer<typeof practiceValidations.memberListItemSchema>;
export type InvitationListItem = z.infer<typeof practiceValidations.invitationListItemSchema>;
