import { z } from '@hono/zod-openapi';
import { addressSchema as onboardingAddressSchema } from '@/shared/validations/address';

import { practiceIdParamSchema } from '@/shared/validations/common';

// --- Shared Core Schemas ---

export const companyInfoSchema = z
  .object({
    name: z.string().optional(),
    tax_id: z.string().optional(),
    address: onboardingAddressSchema.optional(),
  })
  .openapi('CompanyInfo');

export const individualInfoSchema = z
  .object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    email: z.email().optional(),
    dob: z
      .object({
        day: z.number().optional(),
        month: z.number().optional(),
        year: z.number().optional(),
      })
      .optional(),
    ssn_last_4: z.string().optional(),
    address: onboardingAddressSchema.optional(),
  })
  .openapi('IndividualInfo');

export const requirementsSchema = z
  .object({
    currently_due: z.array(z.string()),
    eventually_due: z.array(z.string()),
    past_due: z.array(z.string()),
    pending_verification: z.array(z.string()),
    current_deadline: z.number().nullable().optional(),
    disabled_reason: z.string().nullable().optional(),
  })
  .openapi('Requirements');

export const capabilitiesSchema = z.record(z.string(), z.string()).openapi('Capabilities');

export const tosAcceptanceSchema = z
  .object({
    date: z.number().optional(),
    ip: z.string().optional(),
    user_agent: z.string().optional(),
  })
  .openapi('TosAcceptance');

export const externalAccountSchema = z
  .object({
    id: z.string(),
    object: z.string(),
    account: z.string().optional(),
    account_holder_name: z.string().optional(),
    account_holder_type: z.string().optional(),
    bank_name: z.string().optional(),
    country: z.string().optional(),
    currency: z.string().optional(),
    default_for_currency: z.boolean().optional(),
    fingerprint: z.string().optional(),
    last_4: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    routing_number: z.string().optional(),
    status: z.string().optional(),
  })
  .openapi('ExternalAccount');

export const externalAccountsSchema = z
  .object({
    object: z.literal('list'),
    data: z.array(externalAccountSchema),
  })
  .openapi('ExternalAccounts');

// --- API Request/Response Schemas ---

export const createAccountRequestSchema = z
  .object({
    email: z.email().openapi({ example: 'user@example.com' }),
    country: z.string().length(2).default('US'),
  })
  .openapi('CreateAccountRequest');

export const createAccountResponseSchema = z
  .object({
    account_id: z.string().openapi({ example: 'acct_1234567890' }),
    url: z.string().openapi({ example: 'https://connect.stripe.com/setup/s/123' }),
    expires_at: z.number().openapi({ example: 1234567890 }),
    session_status: z.enum(['valid', 'expired', 'created']).openapi({ example: 'created' }),
    status: z.object({
      charges_enabled: z.boolean(),
      payouts_enabled: z.boolean(),
      details_submitted: z.boolean(),
    }),
  })
  .openapi('CreateAccountResponse');

export const getAccountResponseSchema = z
  .object({
    account_id: z.string().openapi({ example: 'acct_1234567890' }),
    status: z.object({
      charges_enabled: z.boolean(),
      payouts_enabled: z.boolean(),
      details_submitted: z.boolean(),
      is_active: z.boolean(),
      readiness_status: z.enum(['active', 'requirements_due', 'verification_pending', 'disabled', 'inactive']),
      missing_requirements: z.array(z.string()),
      disabled_reason: z.string().nullable(),
      current_deadline: z.number().nullable(),
    }),
    requirements: requirementsSchema.nullish(),
    future_requirements: requirementsSchema.nullish(),
    onboarding_completed_at: z.date().nullable().openapi({ example: '2023-01-01T00:00:00Z' }),
  })
  .openapi('GetAccountResponse');

export const createSessionResponseSchema = z
  .object({
    url: z.string().optional().openapi({ example: 'https://connect.stripe.com/setup/s/123' }),
    client_secret: z.string().optional().openapi({ example: 'secret_123' }),
    expires_at: z.number().openapi({ example: 1234567890 }),
  })
  .openapi('CreateSessionResponse');

export const webhookResponseSchema = z
  .object({
    received: z.boolean(),
    already_processed: z.boolean().optional(),
  })
  .openapi('WebhookResponse');

/**
 * Combined / Derived Schemas
 */

export const createOnboardingSessionSchema = createAccountRequestSchema.extend({
  refresh_url: z.url().openapi({
    description: 'The URL to redirect to if they click back/refresh',
    example: 'https://app.blawby.com/onboarding/refresh',
  }),
  return_url: z.url().openapi({
    description: 'The URL to redirect to after completion',
    example: 'https://app.blawby.com/onboarding/return',
  }),
});

export const createConnectedAccountSchema = z.object({
  practice_email: z.email().openapi({ example: 'practice@example.com' }),
  practice_uuid: z.uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }),
  refresh_url: z.url().openapi({ example: 'https://app.blawby.com/onboarding/refresh' }),
  return_url: z.url().openapi({ example: 'https://app.blawby.com/onboarding/return' }),
});

export const onboardingStatusResponseSchema = z
  .object({
    practice_uuid: z.uuid().openapi({
      example: '123e4567-e89b-12d3-a456-426614174000',
    }),
    connected_account_id: z.uuid().nullable().openapi({
      example: '123e4567-e89b-12d3-a456-426614174000',
    }),
    stripe_account_id: z.string().nullable().openapi({
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
  .openapi('OnboardingStatusResponse');

export const createConnectedAccountResponseSchema = onboardingStatusResponseSchema.openapi(
  'CreateConnectedAccountResponse'
);

/**
 * Error Schemas
 */

export const errorResponseSchema = z
  .object({
    error: z.string().openapi({ example: 'Bad Request' }),
    message: z.string().openapi({ example: 'Invalid request data' }),
    details: z
      .array(
        z.object({
          field: z.string(),
          message: z.string(),
          code: z.string(),
        })
      )
      .optional(),
  })
  .openapi('ErrorResponse');

export const notFoundResponseSchema = z
  .object({
    error: z.string().openapi({ example: 'Not Found' }),
    message: z.string().openapi({ example: 'Onboarding status not found' }),
  })
  .openapi('NotFoundResponse');

export const internalServerErrorResponseSchema = z
  .object({
    error: z.string().openapi({ example: 'Internal Server Error' }),
    message: z.string().openapi({ example: 'Failed to create connected account' }),
  })
  .openapi('InternalServerErrorResponse');

/**
 * Validation Object for Module
 */
export const onboardingValidations = {
  practiceIdParamSchema,
  createOnboardingSessionSchema,
  createConnectedAccountSchema,
  onboardingStatusResponseSchema,
  createConnectedAccountResponseSchema,
  getAccountResponseSchema,
  createAccountRequestSchema,
  createAccountResponseSchema,
  createSessionResponseSchema,
  webhookResponseSchema,
  onboardingAddressSchema,
  companyInfoSchema,
  individualInfoSchema,
  requirementsSchema,
  capabilitiesSchema,
  tosAcceptanceSchema,
  externalAccountSchema,
  externalAccountsSchema,
  errorResponseSchema,
  notFoundResponseSchema,
  internalServerErrorResponseSchema,
};
