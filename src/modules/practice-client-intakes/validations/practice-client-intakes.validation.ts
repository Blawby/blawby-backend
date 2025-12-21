import { z } from 'zod';

export const createPracticeClientIntakeSchema = z.object({
  slug: z.string().min(1).max(100),
  amount: z.number().int().min(50).max(99999999), // $0.50 to $999,999.99
  email: z.string().email().max(255),
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  onBehalfOf: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
});

export const updatePracticeClientIntakeSchema = z.object({
  amount: z.number().int().min(50).max(99999999),
});

export const slugParamSchema = z.object({
  slug: z.string().min(1).max(100),
});

export const uuidParamSchema = z.object({
  uuid: z.string().uuid(), // UUID format
});

export type CreatePracticeClientIntakeRequest = z.infer<typeof createPracticeClientIntakeSchema>;
export type UpdatePracticeClientIntakeRequest = z.infer<typeof updatePracticeClientIntakeSchema>;
export type SlugParam = z.infer<typeof slugParamSchema>;
export type UuidParam = z.infer<typeof uuidParamSchema>;

// Response schemas for OpenAPI
export const practiceClientIntakeSettingsResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    organization: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      logo: z.string().optional(),
    }),
    settings: z.object({
      paymentLinkEnabled: z.boolean(),
      prefillAmount: z.number(),
    }),
    connectedAccount: z.object({
      id: z.string(),
      chargesEnabled: z.boolean(),
    }),
  }).optional(),
  error: z.string().optional(),
});

export const createPracticeClientIntakeResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    uuid: z.string().uuid(),
    clientSecret: z.string(),
    amount: z.number(),
    currency: z.string(),
    status: z.string(),
    organization: z.object({
      name: z.string(),
      logo: z.string().optional(),
    }),
  }).optional(),
  error: z.string().optional(),
});

export const updatePracticeClientIntakeResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    uuid: z.string().uuid(),
    clientSecret: z.string(),
    amount: z.number(),
    currency: z.string(),
    status: z.string(),
  }).optional(),
  error: z.string().optional(),
});

export const practiceClientIntakeStatusResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    uuid: z.string().uuid(),
    amount: z.number(),
    currency: z.string(),
    status: z.string(),
    stripeChargeId: z.string().optional(),
    metadata: z.object({
      email: z.string(),
      name: z.string(),
      phone: z.string().optional(),
      onBehalfOf: z.string().optional(),
      description: z.string().optional(),
    }),
    succeededAt: z.date().optional(),
    createdAt: z.date(),
  }).optional(),
  error: z.string().optional(),
});

export const errorResponseSchema = z.object({
  error: z.string(),
});

export const notFoundResponseSchema = z.object({
  error: z.string(),
});

export const internalServerErrorResponseSchema = z.object({
  error: z.string(),
});
