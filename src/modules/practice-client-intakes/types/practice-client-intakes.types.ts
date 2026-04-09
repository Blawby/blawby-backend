import type { z } from '@hono/zod-openapi';
import type { intakeValidations } from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';

export type TriageStatus = 'pending_review' | 'accepted' | 'declined';

// Inferred from Zod schemas
export type CreatePracticeClientIntakeRequest = z.infer<typeof intakeValidations.createPracticeClientIntakeSchema>;
export type UpdatePracticeClientIntakeRequest = z.infer<typeof intakeValidations.updatePracticeClientIntakeSchema>;
export type ConvertIntakeRequest = z.infer<typeof intakeValidations.convertIntakeSchema>;
export type SlugParam = z.infer<typeof intakeValidations.slugParamSchema>;
export type UuidParam = z.infer<typeof intakeValidations.uuidParamSchema>;
export type CheckoutSessionStatusQuery = z.infer<typeof intakeValidations.checkoutSessionStatusQuerySchema>;
export type ClaimPracticeClientIntakeRequest = z.infer<typeof intakeValidations.claimPracticeClientIntakeSchema>;
export type UpdateIntakeTriageStatusRequest = z.infer<typeof intakeValidations.updateIntakeTriageStatusSchema>;

/**
 * Onboarding settings for client intakes
 */
export interface IntakeSettings {
  payment_link_enabled: boolean;
  consultation_fee: number;
  service_area: { id: string; name: string; key: string }[];
}

/**
 * Intake data from database
 */
export interface ClientIntake {
  uuid: string;
  organization_id: string;
  amount: number;
  currency: string;
  status: string;
  customer_email: string;
  customer_name: string;
  customer_phone?: string | null;
  on_behalf_of?: string | null;
  opposing_party?: string | null;
  description?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_payment_link_id?: string | null;
  stripe_charge_id?: string | null;
  metadata?: Record<string, unknown> | null;
  succeeded_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Response types
 */
export type IntakeSettingsResponse = z.infer<typeof intakeValidations.practiceClientIntakeSettingsResponseSchema>;
export type CreateIntakeResponse = z.infer<typeof intakeValidations.createPracticeClientIntakeResponseSchema>;
export type CreateCheckoutSessionResponse = z.infer<
  typeof intakeValidations.createPracticeClientIntakeCheckoutSessionResponseSchema
>;
export type UpdateIntakeResponse = z.infer<typeof intakeValidations.updatePracticeClientIntakeResponseSchema>;
export type IntakeStatusResponse = z.infer<typeof intakeValidations.practiceClientIntakeStatusResponseSchema>;
export type IntakePostPayStatusResponse = z.infer<
  typeof intakeValidations.practiceClientIntakePostPayStatusResponseSchema
>;
export type ClaimPracticeClientIntakeResponse = z.infer<
  typeof intakeValidations.claimPracticeClientIntakeResponseSchema
>;
export type UpdateIntakeTriageStatusResponse = z.infer<typeof intakeValidations.updateIntakeTriageStatusResponseSchema>;
export type ListIntakesResponse = z.infer<typeof intakeValidations.listIntakesResponseSchema>;
export type ListIntakeItem = NonNullable<ListIntakesResponse['data']>['intakes'][number];
export type TriggerIntakeInvitationResponse = z.infer<typeof intakeValidations.triggerIntakeInvitationResponseSchema>;
export type ConvertIntakeResponse = z.infer<typeof intakeValidations.convertIntakeResponseSchema>;
