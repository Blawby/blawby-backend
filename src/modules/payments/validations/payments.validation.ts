import { z } from 'zod';

import { nameValidator, paginatedQuerySchema } from '@/shared/validations/common';

export const createPaymentSchema = z.object({
  name: nameValidator,
});

export const updatePaymentSchema = createPaymentSchema.partial();

export const paymentQuerySchema = paginatedQuerySchema.extend({
  search: z.string().optional(),
});

export type CreatePaymentRequest = z.infer<typeof createPaymentSchema>;
export type UpdatePaymentRequest = z.infer<typeof updatePaymentSchema>;
export type PaymentQueryParams = z.infer<typeof paymentQuerySchema>;
