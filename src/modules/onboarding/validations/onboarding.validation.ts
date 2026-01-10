import { z } from '@hono/zod-openapi';

import { emailValidator, organizationIdParamSchema } from '@/shared/validations/common';

/**
 * Create onboarding session validation schema
 */
export const createOnboardingSessionSchema = z.object({
  practice_email: emailValidator.optional(),
  refresh_url: z.url('Invalid refresh url').openapi({
    description: 'The URL to redirect the user to if they click the back button or refresh the page during onboarding',
    example: 'https://app.blawby.com/onboarding/refresh',
  }),
  return_url: z.url('Invalid return url').openapi({
    description: 'The URL to redirect the user to after they successfully complete the onboarding flow',
    example: 'https://app.blawby.com/onboarding/return',
  }),
});

/**
 * Create connected account validation schema
 */
export const createConnectedAccountSchema = z.object({
  practice_email: emailValidator,
  practice_uuid: z.uuid('Invalid practice uuid'),
  refresh_url: z.string().url('Invalid refresh url').openapi({
    description: 'The URL to redirect the user to if they click the back button or refresh the page during onboarding',
    example: 'https://app.blawby.com/onboarding/refresh',
  }),
  return_url: z.string().url('Invalid return url').openapi({
    description: 'The URL to redirect the user to after they successfully complete the onboarding flow',
    example: 'https://app.blawby.com/onboarding/return',
  }),
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
    charges_enabled: z.boolean().openapi({
      example: false,
    }),
    payouts_enabled: z.boolean().openapi({
      example: false,
    }),
    details_submitted: z.boolean().openapi({
      example: false,
    }),
    url: z.string().optional().openapi({
      description: 'The Stripe-hosted URL to redirect the user to for onboarding (if applicable)',
      example: 'https://connect.stripe.com/setup/s/1234567890',
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
    charges_enabled: z.boolean().openapi({
      example: false,
    }),
    payouts_enabled: z.boolean().openapi({
      example: false,
    }),
    details_submitted: z.boolean().openapi({
      example: false,
    }),
    url: z.string().optional().openapi({
      description: 'The Stripe-hosted URL to redirect the user to finish onboarding',
      example: 'https://connect.stripe.com/setup/s/1234567890',
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
