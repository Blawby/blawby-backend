import { z } from 'zod';
import {
  nameValidator,
  slugValidator,
  urlValidator,
  emailValidator,
  phoneValidator,
  currencyValidator,
} from '@/shared/validations/common';

// Practice details validation schemas
export const businessPhoneSchema = phoneValidator.optional();
export const businessEmailSchema = emailValidator.optional();
export const consultationFeeSchema = currencyValidator.optional();
export const paymentUrlSchema = urlValidator.optional().or(z.literal(''));
export const calendlyUrlSchema = urlValidator.optional().or(z.literal(''));


// Practice module specific param schemas
export const practiceIdParamSchema = z.object({
  uuid: z.uuid().refine((val) => val.length > 0, 'Invalid practice uuid'),
});


// Combined practice details schema
export const practiceDetailsValidationSchema = z.object({
  business_phone: businessPhoneSchema,
  business_email: businessEmailSchema,
  consultation_fee: consultationFeeSchema,
  payment_url: paymentUrlSchema,
  calendly_url: calendlyUrlSchema,
});

// Complete practice schemas
export const createPracticeSchema = z.object({
  // Organization fields (required)
  name: nameValidator,
  slug: slugValidator,
  logo: urlValidator.optional().or(z.literal('')),
  metadata: z.record(z.string(), z.any()).optional(),

  // Practice details
  ...practiceDetailsValidationSchema.shape,
});

export const updatePracticeSchema = z
  .object({
    // Organization fields (all optional for updates)
    name: nameValidator.optional(),
    slug: slugValidator.optional(),
    logo: urlValidator.optional().or(z.literal('')),
    metadata: z.record(z.string(), z.any()).optional(),

    // Practice details
    ...practiceDetailsValidationSchema.shape,
  })
  .refine(
    (data) => {
      // Ensure at least one field is provided for update
      const hasOrgField = data.name || data.slug || data.logo || data.metadata;
      const hasPracticeField
        = data.business_phone
        || data.business_email
        || data.consultation_fee
        || data.payment_url
        || data.calendly_url;
      return hasOrgField || hasPracticeField;
    },
    {
      message: 'At least one field must be provided to update the practice',
    },
  );

// Response schemas
export const practiceResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  logo: z.string().nullable(),
  metadata: z.record(z.string(), z.any()).nullable(),
  business_phone: z.string().nullable(),
  business_email: z.string().nullable(),
  consultation_fee: z.number().nullable(),
  payment_url: z.string().nullable(),
  calendly_url: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// Query schemas
export const practiceQuerySchema = z.object({
  includeDetails: z.coerce.boolean().default(true),
});

// Infer types from schemas
export type CreatePracticeRequest = z.infer<typeof createPracticeSchema>;
export type UpdatePracticeRequest = z.infer<typeof updatePracticeSchema>;
export type PracticeQueryParams = z.infer<typeof practiceQuerySchema>;
