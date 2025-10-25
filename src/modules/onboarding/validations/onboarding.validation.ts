import { z } from 'zod';

import { emailValidator, organizationIdParamSchema } from '@/shared/validations/common';

/**
 * Create onboarding session validation schema
 */
export const createOnboardingSessionSchema = z.object({
  practice_email: emailValidator.optional(),
});

/**
 * Create connected account validation schema
 */
export const createConnectedAccountSchema = z.object({
  practice_email: emailValidator,
  practice_uuid: z.uuid('Invalid practice uuid'),
});

/**
 * Export the organization ID param schema for reuse
 */
export { organizationIdParamSchema };

/**
 * Infer types from schemas
 */
export type CreateOnboardingSessionRequest = z.infer<typeof createOnboardingSessionSchema>;
export type CreateConnectedAccountRequest = z.infer<typeof createConnectedAccountSchema>;
