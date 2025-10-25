import { z } from 'zod';

export const emailValidator = z
  .email('Invalid email format')
  .min(1, 'Email is required');

export const phoneValidator = z
  .string()
  .regex(/^\+?[\d\s-()]+$/, 'Invalid phone format')
  .min(1, 'Phone number is required');

export const urlValidator = z
  .url('Invalid URL format');

export const uuidValidator = z.uuid('Invalid UUID format');


export const currencyValidator = z
  .number()
  .refine((val) => val > 0, 'Currency must be greater than 0');

export const slugValidator = z
  .string()
  .min(1, 'Slug is required')
  .max(50, 'Slug too long')
  .regex(
    /^[a-z0-9-]+$/,
    'Slug must contain only lowercase letters, numbers, and hyphens',
  );

export const nameValidator = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name too long');

// Common schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).optional(),
});

export const searchSchema = z.object({
  search: z.string().optional(),
  q: z.string().optional(),
});

export const idParamSchema = z.object({
  id: uuidValidator,
});

// Parameter validation schemas
export const organizationIdParamSchema = z.object({
  organizationId: uuidValidator,
});

export const clientIdParamSchema = z.object({
  id: uuidValidator,
});

export const invoiceIdParamSchema = z.object({
  id: uuidValidator,
});

export const paymentIntentIdParamSchema = z.object({
  id: uuidValidator,
});

export const payoutIdParamSchema = z.object({
  id: uuidValidator,
});

export const practiceIdParamSchema = z.object({
  id: uuidValidator.refine((val) => val.length > 0, 'Invalid practice ID'),
});

export const customerIdParamSchema = z.object({
  id: uuidValidator,
});

export const subscriptionIdParamSchema = z.object({
  id: uuidValidator,
});


// Combined parameter schemas for routes with multiple parameters
export const organizationClientParamsSchema = organizationIdParamSchema.and(clientIdParamSchema);

export const organizationInvoiceParamsSchema = organizationIdParamSchema.and(invoiceIdParamSchema);

export const organizationPaymentParamsSchema = organizationIdParamSchema.and(paymentIntentIdParamSchema);

export const sortSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const bulkActionSchema = z.object({
  ids: z.array(uuidValidator).min(1, 'At least one ID is required'),
  action: z.string().min(1, 'Action is required'),
});

// Combined common schemas
export const paginatedQuerySchema = paginationSchema
  .and(searchSchema)
  .and(sortSchema);

export const dateFilteredQuerySchema
  = paginatedQuerySchema.and(dateRangeSchema);
