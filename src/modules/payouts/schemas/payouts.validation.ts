import { z } from '@hono/zod-openapi';

const payoutStatusValues = ['paid', 'pending', 'in_transit', 'canceled', 'failed'] as const;

/**
 * Query params for the payouts ledger list endpoint.
 */
const listPayoutsQuerySchema = z.object({
  status: z.enum(payoutStatusValues).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * A single payout (settlement batch) as exposed by the API.
 */
const payoutSchema = z
  .object({
    id: z.uuid(),
    stripe_payout_id: z.string().openapi({ example: 'po_1234567890' }),
    stripe_account_id: z.string().openapi({ example: 'acct_1234567890' }),
    amount: z.number().int().openapi({ description: 'Payout amount in cents', example: 125000 }),
    currency: z.string().openapi({ example: 'usd' }),
    // Free-form string rather than an enum so unexpected Stripe statuses never break serialization.
    status: z.string().openapi({ description: 'paid | pending | in_transit | canceled | failed', example: 'paid' }),
    type: z.string().nullable().openapi({ description: 'bank_account | card', example: 'bank_account' }),
    method: z.string().nullable().openapi({ description: 'standard | instant', example: 'standard' }),
    description: z.string().nullable(),
    statement_descriptor: z.string().nullable(),
    failure_code: z.string().nullable(),
    failure_message: z.string().nullable(),
    destination_id: z.string().nullable().openapi({ example: 'ba_1234567890' }),
    automatic: z.boolean(),
    arrival_date: z.iso.datetime({ offset: true }).nullable(),
    stripe_created_at: z.iso.datetime({ offset: true }),
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
  })
  .openapi('Payout');

/**
 * A balance transaction that settled within a payout (a line of the settlement batch).
 */
const payoutTransactionSchema = z
  .object({
    id: z.string().openapi({ example: 'txn_1234567890' }),
    type: z.string().openapi({ description: 'charge | refund | payment | stripe_fee | ...', example: 'charge' }),
    amount: z.number().int().openapi({ description: 'Gross amount in cents', example: 5000 }),
    fee: z.number().int().openapi({ description: 'Stripe fee in cents', example: 175 }),
    net: z.number().int().openapi({ description: 'Net amount in cents (amount - fee)', example: 4825 }),
    currency: z.string().openapi({ example: 'usd' }),
    description: z.string().nullable(),
    source: z.string().nullable().openapi({ description: 'Source object id (e.g. charge/refund)', example: 'ch_123' }),
    created: z.iso.datetime({ offset: true }),
  })
  .openapi('PayoutTransaction');

/**
 * Payout detail: the payout plus the settlement batch breakdown fetched live from Stripe.
 */
const payoutDetailSchema = payoutSchema
  .extend({
    balance_transaction_id: z.string().nullable(),
    metadata: z.record(z.string(), z.string()).nullable(),
    transactions: z.array(payoutTransactionSchema),
    transactions_has_more: z.boolean().openapi({
      description: 'True when the settlement batch has more line items than were returned',
    }),
  })
  .openapi('PayoutDetail');

export type ListPayoutsQuery = z.infer<typeof listPayoutsQuerySchema>;
export type PayoutResponse = z.infer<typeof payoutSchema>;
export type PayoutTransactionResponse = z.infer<typeof payoutTransactionSchema>;
export type PayoutDetailResponse = z.infer<typeof payoutDetailSchema>;

export const payoutValidations = {
  payoutStatusValues,
  listPayoutsQuerySchema,
  payoutSchema,
  payoutTransactionSchema,
  payoutDetailSchema,
};
