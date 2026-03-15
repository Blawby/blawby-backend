import { z } from '@hono/zod-openapi';

const ALLOWED_COMPONENTS = [
  'payments',
  'payment_details',
  'disputes',
  'disputes_list',
  'payouts',
  'payouts_list',
  'payout_details',
  'balances',
  'reporting_chart',
  'documents',
  'account_onboarding',
  'account_management',
  'notification_banner',
  'tax_registrations',
  'tax_settings',
  'tax_exports',
  'tax_threshold_monitoring',
] as const;

type AllowedComponent = (typeof ALLOWED_COMPONENTS)[number];

const createAccountSessionSchema = z
  .object({
    components: z
      .array(z.enum(ALLOWED_COMPONENTS))
      .min(1)
      .openapi({ example: ['payments', 'balances'] }),
  })
  .openapi('CreateAccountSessionRequest');

const accountSessionResponseSchema = z
  .object({
    client_secret: z.string().openapi({ example: 'accs_secret_...' }),
    expires_at: z.number().openapi({ example: 1700000000 }),
    account_id: z.string().openapi({ example: 'acct_1234567890' }),
  })
  .openapi('AccountSessionResponse');

const connectValidations = {
  createAccountSessionSchema,
  accountSessionResponseSchema,
};

export type { AllowedComponent };
export { ALLOWED_COMPONENTS, createAccountSessionSchema, accountSessionResponseSchema, connectValidations };
