import { z } from '@hono/zod-openapi';

const preferredContactMethodSchema = z.enum(['phone', 'email', 'text']);
const eligibilityStatusSchema = z.enum(['pending', 'eligible', 'ineligible', 'referred']);

/**
 * PUT body — partial merge (only provided fields change), matching the
 * preferences upsert convention.
 *
 * The discount mirrors Stripe's Coupon model exactly: a discount is either
 * `amount_off` (minor units, paired with `currency`) or `percent_off` — never
 * both. The discount is treated as a unit: provide any of the three discount
 * fields to (re)set it, or set them all to `null` to clear it.
 */
export const updateIntakeProfileSchema = z
  .object({
    date_of_birth: z.iso.date().nullable().optional(),
    preferred_contact_method: preferredContactMethodSchema.nullable().optional(),
    referral_source: z.string().max(255).nullable().optional(),
    intake_date: z.iso.date().nullable().optional(),
    eligibility_status: eligibilityStatusSchema.optional(),
    amount_off: z.number().int().positive().nullable().optional().openapi({
      description: 'Stripe amount_off: discount in the minor currency unit (e.g. cents). Requires currency.',
    }),
    percent_off: z.number().gt(0).max(100).nullable().optional().openapi({
      description: 'Stripe percent_off: percentage discount, 0 < value <= 100. Mutually exclusive with amount_off.',
    }),
    currency: z.string().length(3).nullable().optional().openapi({
      description: 'Stripe currency: 3-letter ISO code. Required with amount_off, and must be omitted for percent_off.',
    }),
    discount_note: z.string().max(1000).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const touchesDiscount =
      data.amount_off !== undefined || data.percent_off !== undefined || data.currency !== undefined;
    if (!touchesDiscount) {
      return;
    }

    const amountOff = data.amount_off ?? null;
    const percentOff = data.percent_off ?? null;
    const currency = data.currency ?? null;

    // All cleared — valid (removes any existing discount).
    if (amountOff === null && percentOff === null && currency === null) {
      return;
    }

    if (amountOff !== null && percentOff !== null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide either amount_off or percent_off, not both',
        path: ['amount_off'],
      });
      return;
    }

    if (amountOff !== null) {
      if (currency === null) {
        ctx.addIssue({ code: 'custom', message: 'currency is required when amount_off is set', path: ['currency'] });
      }
      return;
    }

    if (percentOff !== null) {
      if (currency !== null) {
        ctx.addIssue({
          code: 'custom',
          message: 'currency must not be set for a percent_off discount',
          path: ['currency'],
        });
      }
      return;
    }

    // Only currency was provided (no amount_off / percent_off).
    ctx.addIssue({ code: 'custom', message: 'currency requires amount_off', path: ['currency'] });
  })
  .openapi('UpdateClientIntakeProfile');

export const clientIntakeProfileSchema = z
  .object({
    id: z.uuid(),
    client_id: z.uuid(),
    date_of_birth: z.iso.date().nullable(),
    preferred_contact_method: preferredContactMethodSchema.nullable(),
    referral_source: z.string().nullable(),
    intake_date: z.iso.date().nullable(),
    eligibility_status: eligibilityStatusSchema,
    amount_off: z.number().int().nullable(),
    percent_off: z.number().nullable(),
    currency: z.string().nullable(),
    discount_note: z.string().nullable(),
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
  })
  .openapi('ClientIntakeProfile');

export type UpdateIntakeProfileInput = z.infer<typeof updateIntakeProfileSchema>;

export const clientIntakeProfilesValidations = {
  updateIntakeProfileSchema,
  clientIntakeProfileSchema,
};
