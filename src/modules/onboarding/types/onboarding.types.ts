import { z } from '@hono/zod-openapi';

// --- Shared Core Schemas ---

export const OnboardingAddressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postal_code: z.string().optional(),
  country: z.string().optional(),
});

export const CompanyInfoSchema = z.object({
  name: z.string().optional(),
  tax_id: z.string().optional(),
  address: OnboardingAddressSchema.optional(),
});

export const IndividualInfoSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().email().optional(),
  dob: z.object({
    day: z.number().optional(),
    month: z.number().optional(),
    year: z.number().optional(),
  }).optional(),
  ssn_last_4: z.string().optional(),
  address: OnboardingAddressSchema.optional(),
});

export const RequirementsSchema = z.object({
  currently_due: z.array(z.string()),
  eventually_due: z.array(z.string()),
  past_due: z.array(z.string()),
  pending_verification: z.array(z.string()),
  current_deadline: z.number().nullable().optional(),
  disabled_reason: z.string().nullable().optional(),
});

export const CapabilitiesSchema = z.record(z.string(), z.string());

export const TosAcceptanceSchema = z.object({
  date: z.number().optional(),
  ip: z.string().optional(),
  user_agent: z.string().optional(),
});

export const ExternalAccountSchema = z.object({
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
});

export const ExternalAccountsSchema = z.object({
  object: z.literal('list'),
  data: z.array(ExternalAccountSchema),
});

// --- Derived Types from Schemas ---

export type OnboardingAddress = z.infer<typeof OnboardingAddressSchema>;
export type CompanyInfo = z.infer<typeof CompanyInfoSchema>;
export type IndividualInfo = z.infer<typeof IndividualInfoSchema>;
export type Requirements = z.infer<typeof RequirementsSchema>;
export type FutureRequirements = Requirements;
export type Capabilities = z.infer<typeof CapabilitiesSchema>;
export type TosAcceptance = z.infer<typeof TosAcceptanceSchema>;
export type ExternalAccount = z.infer<typeof ExternalAccountSchema>;
export type ExternalAccounts = z.infer<typeof ExternalAccountsSchema>;

// --- API Request/Response Schemas & Types ---

export const CreateAccountRequestSchema = z.object({
  email: z.string().email(),
  country: z.string().length(2).default('US'),
}).openapi('CreateAccountRequest');

export const CreateAccountResponseSchema = z.object({
  account_id: z.string().openapi({ example: 'acct_1234567890' }),
  url: z.string().openapi({ example: 'https://connect.stripe.com/setup/s/123' }),
  expires_at: z.number().openapi({ example: 1234567890 }),
  session_status: z.enum(['valid', 'expired', 'created']).openapi({ example: 'created' }),
  status: z.object({
    charges_enabled: z.boolean(),
    payouts_enabled: z.boolean(),
    details_submitted: z.boolean(),
  }),
}).openapi('CreateAccountResponse');

export const GetAccountResponseSchema = z.object({
  accountId: z.string().openapi({ example: 'acct_1234567890' }),
  status: z.object({
    charges_enabled: z.boolean(),
    payouts_enabled: z.boolean(),
    details_submitted: z.boolean(),
    is_active: z.boolean(),
    readiness_status: z.enum([
      'active',
      'requirements_due',
      'verification_pending',
      'disabled',
      'inactive',
    ]),
    missing_requirements: z.array(z.string()),
    disabled_reason: z.string().nullable(),
    current_deadline: z.number().nullable(),
  }),
  requirements: RequirementsSchema.nullish(),
  future_requirements: RequirementsSchema.nullish(),
  onboarding_completed_at: z.string().nullable().openapi({ example: '2023-01-01T00:00:00Z' }),
}).openapi('GetAccountResponse');

export const CreateSessionResponseSchema = z.object({
  url: z.string().optional().openapi({ example: 'https://connect.stripe.com/setup/s/123' }),
  client_secret: z.string().optional().openapi({ example: 'secret_123' }),
  expires_at: z.number().openapi({ example: 1234567890 }),
}).openapi('CreateSessionResponse');

export const WebhookResponseSchema = z.object({
  received: z.boolean(),
  already_processed: z.boolean().optional(),
}).openapi('WebhookResponse');

export type CreateAccountRequest = z.infer<typeof CreateAccountRequestSchema>;
export type CreateAccountResponse = z.infer<typeof CreateAccountResponseSchema>;
export type GetAccountResponse = z.infer<typeof GetAccountResponseSchema>;
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;
export type WebhookResponse = z.infer<typeof WebhookResponseSchema>;

// Internal Base Type
export type StripeConnectedAccountBase = {
  practice_uuid: string;
  stripe_account_id: string;
  url?: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
};
