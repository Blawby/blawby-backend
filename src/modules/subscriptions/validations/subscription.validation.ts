import { z } from '@hono/zod-openapi';

/**
 * Subscription ID parameter schema
 */
const subscriptionIdParamSchema = z.object({
  subscription_id: z.uuid().openapi({
    param: {
      name: 'subscription_id',
      in: 'path',
    },
    description: 'Subscription ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
});

/**
 * Create subscription request schema
 */
const createSubscriptionSchema = z.object({
  plan_id: z.uuid().openapi({
    description: 'Plan ID (UUID) - Required. The UUID of the subscription plan from the database.',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
  plan: z.string().min(1).optional().openapi({
    description: 'Plan name (optional) - Used as fallback if planId lookup fails. Example: "starter", "professional", "enterprise"',
    example: 'professional',
  }),
  success_url: z.url().optional().openapi({
    description: 'URL to redirect after successful subscription',
    example: 'https://app.example.com/dashboard',
  }),
  cancel_url: z.url().optional().openapi({
    description: 'URL to redirect if subscription is cancelled',
    example: 'https://app.example.com/pricing',
  }),
  disable_redirect: z.boolean().optional().default(false).openapi({
    description: 'Disable redirect and return checkout URL in response',
    example: false,
  }),
});

/**
 * Cancel subscription request schema
 */
const cancelSubscriptionSchema = z.object({
  immediately: z.boolean().optional().default(false).openapi({
    description: 'Cancel immediately instead of at period end',
    example: false,
  }),
  reason: z.string().optional().openapi({
    description: 'Reason for cancellation',
    example: 'Switching to a different plan',
  }),
  return_url: z.string().optional().openapi({
    description: 'URL to redirect to after cancellation (for Stripe Billing Portal)',
    example: '/dashboard',
  }),
});

/**
 * Subscription plan response schema (matches subscription_plans table - snake_case)
 */
const subscriptionPlanResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  display_name: z.string(),
  description: z.string().nullable(),
  stripe_product_id: z.string(),
  stripe_monthly_price_id: z.string().nullable(),
  stripe_yearly_price_id: z.string().nullable(),
  monthly_price: z.string().nullable(),
  yearly_price: z.string().nullable(),
  currency: z.string(),
  features: z.array(z.string()),
  limits: z.object({
    users: z.number(),
    invoices_per_month: z.number(),
    storage_gb: z.number(),
  }),
  metered_items: z.array(z.object({
    price_id: z.string(),
    meter_name: z.string(),
    type: z.string(),
  })).nullable().optional(),
  is_active: z.boolean(),
  is_public: z.boolean(),
  sort_order: z.number(),
  metadata: z.record(z.string(), z.string()).nullable().optional(),
  created_at: z.date(),
  updated_at: z.date(),
});

/**
 * Subscription response schema (matches subscriptions table - snake_case)
 */
const subscriptionResponseSchema = z.object({
  id: z.string(),
  plan: z.string(),
  reference_id: z.string().nullable(),
  stripe_customer_id: z.string().nullable(),
  stripe_subscription_id: z.string().nullable(),
  status: z.string(),
  period_start: z.date().nullable(),
  period_end: z.date().nullable(),
  cancel_at_period_end: z.boolean().nullable(),
  seats: z.number().nullable(),
  trial_start: z.date().nullable(),
  trial_end: z.date().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

/**
 * Line item schema (matches subscription_line_items table - snake_case)
 */
const lineItemResponseSchema = z.object({
  id: z.string(),
  subscription_id: z.string(),
  stripe_subscription_item_id: z.string(),
  stripe_price_id: z.string(),
  item_type: z.string(),
  description: z.string().nullable(),
  quantity: z.number(),
  unit_amount: z.string().nullable(),
  metadata: z.record(z.string(), z.string()).nullable().optional(),
  created_at: z.date(),
  updated_at: z.date(),
});

/**
 * Event schema (matches subscription_events table - snake_case)
 */
const eventResponseSchema = z.object({
  id: z.string(),
  subscription_id: z.string(),
  plan_id: z.string().nullable(),
  event_type: z.string(),
  from_status: z.string().nullable(),
  to_status: z.string().nullable(),
  from_plan_id: z.string().nullable(),
  to_plan_id: z.string().nullable(),
  triggered_by: z.string().nullable(),
  triggered_by_type: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  error_message: z.string().nullable(),
  created_at: z.date(),
});

/**
 * Subscription with details response schema
 */
const subscriptionWithDetailsResponseSchema = subscriptionResponseSchema.extend({
  plan: subscriptionPlanResponseSchema.nullable(),
  line_items: z.array(lineItemResponseSchema),
  events: z.array(eventResponseSchema),
});

/**
 * List plans response schema
 */
const listPlansResponseSchema = z.object({
  plans: z.array(subscriptionPlanResponseSchema),
});

/**
 * Get current subscription response schema
 */
const getCurrentSubscriptionResponseSchema = z.object({
  subscription: subscriptionWithDetailsResponseSchema.nullable(),
});

/**
 * Create subscription response schema
 */
const createSubscriptionResponseSchema = z.object({
  subscription_id: z.uuid().optional(),
  checkout_url: z.url().optional(),
  message: z.string(),
});

/**
 * Cancel subscription response schema
 */
const cancelSubscriptionResponseSchema = z.object({
  subscription: subscriptionResponseSchema,
  message: z.string(),
});

/**
 * Common error response schemas
 */
const errorResponseSchema = z
  .object({
    error: z.string(),
    message: z.string().optional(),
    details: z.array(z.object({
      field: z.string(),
      message: z.string(),
      code: z.string(),
    })).optional(),
  })
  .openapi({
    description: 'Error response',
  });

const notFoundResponseSchema = z
  .object({
    error: z.string(),
    message: z.string().optional(),
  })
  .openapi({
    description: 'Resource not found',
  });

const internalServerErrorResponseSchema = z
  .object({
    error: z.string(),
    message: z.string().optional(),
  })
  .openapi({
    description: 'Internal server error',
  });

export const subscriptionValidations = {
  subscriptionIdParamSchema,
  createSubscriptionSchema,
  cancelSubscriptionSchema,
  subscriptionPlanResponseSchema,
  subscriptionResponseSchema,
  subscriptionWithDetailsResponseSchema,
  listPlansResponseSchema,
  getCurrentSubscriptionResponseSchema,
  createSubscriptionResponseSchema,
  cancelSubscriptionResponseSchema,
  errorResponseSchema,
  notFoundResponseSchema,
  internalServerErrorResponseSchema,
};
