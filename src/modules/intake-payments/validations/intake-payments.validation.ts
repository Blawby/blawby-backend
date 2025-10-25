import { z } from 'zod';

export const createIntakePaymentSchema = z.object({
  slug: z.string().min(1).max(100),
  amount: z.number().int().min(50).max(99999999), // $0.50 to $999,999.99
  email: z.string().email().max(255),
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  onBehalfOf: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
});

export const updateIntakePaymentSchema = z.object({
  amount: z.number().int().min(50).max(99999999),
});

export const slugParamSchema = z.object({
  slug: z.string().min(1).max(100),
});

export const ulidParamSchema = z.object({
  ulid: z.string().length(26), // ULID is always 26 chars
});

export type CreateIntakePaymentRequest = z.infer<typeof createIntakePaymentSchema>;
export type UpdateIntakePaymentRequest = z.infer<typeof updateIntakePaymentSchema>;
export type SlugParam = z.infer<typeof slugParamSchema>;
export type UlidParam = z.infer<typeof ulidParamSchema>;
