import { z } from '@hono/zod-openapi';

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
 * Onboarding status response schema
 * Based on StripeConnectedAccountBase type
 */
export const onboardingStatusResponseSchema = z
  .object({
    practice_uuid: z.uuid().openapi({
      example: '123e4567-e89b-12d3-a456-426614174000',
    }),
    stripe_account_id: z.string().openapi({
      example: 'acct_1234567890',
    }),
    client_secret: z.string().nullable().optional().openapi({
      example: null,
    }),
    charges_enabled: z.boolean().openapi({
      example: false,
    }),
    payouts_enabled: z.boolean().openapi({
      example: false,
    }),
    details_submitted: z.boolean().openapi({
      example: false,
    }),
  })
  .openapi('OnboardingStatusResponse');

/**
 * Create connected account response schema
 */
export const createConnectedAccountResponseSchema = z
  .object({
    practice_uuid: z.uuid().openapi({
      example: '123e4567-e89b-12d3-a456-426614174000',
    }),
    stripe_account_id: z.string().openapi({
      example: 'acct_1234567890',
    }),
    client_secret: z.string().optional().openapi({
      example: 'seti_1234567890_secret_abcdef',
    }),
    charges_enabled: z.boolean().openapi({
      example: false,
    }),
    payouts_enabled: z.boolean().openapi({
      example: false,
    }),
    details_submitted: z.boolean().openapi({
      example: false,
    }),
  })
  .openapi('CreateConnectedAccountResponse');

/**
 * Error response schema for validation errors
 */
export const errorResponseSchema = z
  .object({
    error: z.string().openapi({
      example: 'Bad Request',
    }),
    message: z.string().openapi({
      example: 'Invalid request data',
    }),
    details: z
      .array(
        z.object({
          field: z.string(),
          message: z.string(),
          code: z.string(),
        }),
      )
      .optional()
      .openapi({
        example: [
          {
            field: 'practice_email',
            message: 'Invalid email',
            code: 'invalid_string',
          },
        ],
      }),
  })
  .openapi('ErrorResponse');

/**
 * Not found error response schema
 */
export const notFoundResponseSchema = z
  .object({
    error: z.string().openapi({
      example: 'Not Found',
    }),
    message: z.string().openapi({
      example: 'Onboarding status not found',
    }),
  })
  .openapi('NotFoundResponse');

/**
 * Internal server error response schema
 */
export const internalServerErrorResponseSchema = z
  .object({
    error: z.string().openapi({
      example: 'Internal Server Error',
    }),
    message: z.string().openapi({
      example: 'Failed to create connected account',
    }),
  })
  .openapi('InternalServerErrorResponse');

/**
 * Infer types from schemas
 */
export type CreateOnboardingSessionRequest = z.infer<typeof createOnboardingSessionSchema>;
export type CreateConnectedAccountRequest = z.infer<typeof createConnectedAccountSchema>;
export type OnboardingStatusResponse = z.infer<typeof onboardingStatusResponseSchema>;
export type CreateConnectedAccountResponse = z.infer<typeof createConnectedAccountResponseSchema>;
