import { z } from '@hono/zod-openapi';

/**
 * Subscription ID parameter schema
 */
export const subscriptionIdParamSchema = z.object({
  subscriptionId: z.string().uuid().openapi({
    param: {
      name: 'subscriptionId',
      in: 'path',
    },
    description: 'Subscription ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
});

/**
 * Create subscription request schema
 */
export const createSubscriptionSchema = z.object({
  planId: z.string().uuid().openapi({
    description: 'Plan ID (UUID) - Required. The UUID of the subscription plan from the database.',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
  plan: z.string().min(1).optional().openapi({
    description: 'Plan name (optional) - Used as fallback if planId lookup fails. Example: "starter", "professional", "enterprise"',
    example: 'professional',
  }),
  successUrl: z.string().url().optional().openapi({
    description: 'URL to redirect after successful subscription',
    example: 'https://app.example.com/dashboard',
  }),
  cancelUrl: z.string().url().optional().openapi({
    description: 'URL to redirect if subscription is cancelled',
    example: 'https://app.example.com/pricing',
  }),
  disableRedirect: z.boolean().optional().default(false).openapi({
    description: 'Disable redirect and return checkout URL in response',
    example: false,
  }),
});

/**
 * Cancel subscription request schema
 */
export const cancelSubscriptionSchema = z.object({
  immediately: z.boolean().optional().default(false).openapi({
    description: 'Cancel immediately instead of at period end',
    example: false,
  }),
  reason: z.string().optional().openapi({
    description: 'Reason for cancellation',
    example: 'Switching to a different plan',
  }),
});

/**
 * Subscription plan response schema
 */
export const subscriptionPlanResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  stripeProductId: z.string(),
  stripeMonthlyPriceId: z.string().nullable(),
  stripeYearlyPriceId: z.string().nullable(),
  monthlyPrice: z.string().nullable(),
  yearlyPrice: z.string().nullable(),
  currency: z.string(),
  features: z.array(z.string()),
  limits: z.object({
    users: z.number(),
    invoices_per_month: z.number(),
    storage_gb: z.number(),
  }),
  isActive: z.boolean(),
  isPublic: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Subscription response schema
 */
export const subscriptionResponseSchema = z.object({
  id: z.string().uuid(),
  referenceId: z.string().nullable(),
  stripeCustomerId: z.string().nullable(),
  stripeSubscriptionId: z.string().nullable(),
  status: z.string(),
  plan: subscriptionPlanResponseSchema.nullable(),
  currentPeriodStart: z.date().nullable(),
  currentPeriodEnd: z.date().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  canceledAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Subscription with details response schema
 */
export const subscriptionWithDetailsResponseSchema = subscriptionResponseSchema.extend({
  lineItems: z.array(
    z.object({
      id: z.string().uuid(),
      stripePriceId: z.string(),
      itemType: z.string(),
      quantity: z.number(),
      unitAmount: z.string().nullable(),
      description: z.string().nullable(),
    }),
  ),
  events: z.array(
    z.object({
      id: z.string().uuid(),
      eventType: z.string(),
      toStatus: z.string().nullable(),
      triggeredByType: z.string(),
      createdAt: z.date(),
    }),
  ),
});

/**
 * List plans response schema
 */
export const listPlansResponseSchema = z.object({
  plans: z.array(subscriptionPlanResponseSchema),
});

/**
 * Get current subscription response schema
 */
export const getCurrentSubscriptionResponseSchema = z.object({
  subscription: subscriptionWithDetailsResponseSchema.nullable(),
});

/**
 * Create subscription response schema
 */
export const createSubscriptionResponseSchema = z.object({
  subscriptionId: z.string().uuid().optional(),
  checkoutUrl: z.string().url().optional(),
  message: z.string(),
});

/**
 * Cancel subscription response schema
 */
export const cancelSubscriptionResponseSchema = z.object({
  subscription: subscriptionResponseSchema,
  message: z.string(),
});

/**
 * Common error response schemas
 */
export const errorResponseSchema = z
  .object({
    error: z.string(),
    message: z.string().optional(),
  })
  .openapi({
    description: 'Error response',
  });

export const notFoundResponseSchema = z
  .object({
    error: z.string(),
    message: z.string().optional(),
  })
  .openapi({
    description: 'Resource not found',
  });

export const internalServerErrorResponseSchema = z
  .object({
    error: z.string(),
    message: z.string().optional(),
  })
  .openapi({
    description: 'Internal server error',
  });

