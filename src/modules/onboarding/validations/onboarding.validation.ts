import { z } from '@hono/zod-openapi';

import { organizationIdParamSchema } from '@/shared/validations/common';
import {
  CreateAccountRequestSchema,
  CreateAccountResponseSchema,
  GetAccountResponseSchema,
  CreateSessionResponseSchema,
} from '@/modules/onboarding/types/onboarding.types';

/**
 * These are re-exported and refined schemas for the OpenAPI routes.
 * We use the centralized schemas from onboarding.types.TS but keep the
 * file for backward compatibility and route-specific naming if needed.
 */

export const createOnboardingSessionSchema = CreateAccountRequestSchema.extend({
  refresh_url: z.string().url().openapi({
    description: 'The URL to redirect to if they click back/refresh',
    example: 'https://app.blawby.com/onboarding/refresh',
  }),
  return_url: z.string().url().openapi({
    description: 'The URL to redirect to after completion',
    example: 'https://app.blawby.com/onboarding/return',
  }),
});

export const createConnectedAccountSchema = z.object({
  practice_email: z.string().email().openapi({ example: 'practice@example.com' }),
  practice_uuid: z.string().uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }),
  refresh_url: z.string().url().openapi({ example: 'https://app.blawby.com/onboarding/refresh' }),
  return_url: z.string().url().openapi({ example: 'https://app.blawby.com/onboarding/return' }),
});

export const onboardingStatusResponseSchema = GetAccountResponseSchema;
export const createConnectedAccountResponseSchema = CreateAccountResponseSchema;

/**
 * Helper error schemas
 */
export const errorResponseSchema = z.object({
  error: z.string().openapi({ example: 'Bad Request' }),
  message: z.string().openapi({ example: 'Invalid request data' }),
  details: z.array(z.object({
    field: z.string(),
    message: z.string(),
    code: z.string(),
  })).optional(),
}).openapi('ErrorResponse');

export const notFoundResponseSchema = z.object({
  error: z.string().openapi({ example: 'Not Found' }),
  message: z.string().openapi({ example: 'Onboarding status not found' }),
}).openapi('NotFoundResponse');

export const internalServerErrorResponseSchema = z.object({
  error: z.string().openapi({ example: 'Internal Server Error' }),
  message: z.string().openapi({ example: 'Failed to create connected account' }),
}).openapi('InternalServerErrorResponse');

/**
 * Export the organization ID param schema for reuse
 */
export { organizationIdParamSchema };

/**
 * Infer types
 */
export type CreateOnboardingSessionRequest = z.infer<typeof createOnboardingSessionSchema>;
export type CreateConnectedAccountRequest = z.infer<typeof createConnectedAccountSchema>;
export type OnboardingStatusResponse = z.infer<typeof onboardingStatusResponseSchema>;
export type CreateConnectedAccountResponse = z.infer<typeof createConnectedAccountResponseSchema>;
