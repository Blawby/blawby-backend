import { z } from 'zod';
import { subscriptionValidations } from '@/modules/subscriptions/validations/subscription.validation';

// Inferred from Zod schemas
export type CreateSubscriptionRequest = z.infer<typeof subscriptionValidations.createSubscriptionSchema>;
export type CancelSubscriptionRequest = z.infer<typeof subscriptionValidations.cancelSubscriptionSchema>;

// ============================================================================
// WHY WE CAN'T INFER TYPES (like practice.types.ts does)
// ============================================================================

/**
 * ISSUE: Stripe plugin methods are NOT typed in BetterAuthInstance['api']
 *
 * Unlike organization plugin methods (createOrganization, listOrganizations, etc.),
 * the Stripe plugin methods (upgradeSubscription, cancelSubscription, etc.) are NOT
 * automatically typed in BetterAuthInstance['api'].
 */

// ============================================================================
// BETTER AUTH SUBSCRIPTION API TYPES
// ============================================================================

/**
 * Subscription API types for Better Auth Stripe plugin
 * Based on Better Auth documentation: https://better-auth.com/docs/plugins/stripe
 */

// Query parameter types
export type ListSubscriptionsQuery = {
  referenceId?: string;
  customerType?: 'user' | 'organization';
};

// Request body types
export type UpgradeSubscriptionBody = {
  plan: string;
  annual?: boolean;
  reference_id?: string;
  subscription_id?: string;
  metadata?: Record<string, unknown>;
  customer_type?: 'user' | 'organization';
  seats?: number;
  locale?: string;
  success_url: string;
  cancel_url: string;
  return_url?: string;
  disable_redirect?: boolean;
};

export type CancelSubscriptionBody = {
  subscription_id: string;
  reference_id?: string;
  customer_type?: 'organization';
  return_url?: string;
  immediately?: boolean;
};

export type RestoreSubscriptionBody = {
  subscription_id: string;
  reference_id?: string;
  customer_type?: 'user' | 'organization';
};


export type UpgradeSubscriptionResponse = {
  subscriptionId?: string;
  url?: string;
};

// Better Auth internal subscription object (camelCase)
export type BetterAuthSubscription = {
  id: string;
  plan: string;
  referenceId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
  seats: number | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// ============================================================================
// API METHOD TYPES
// ============================================================================

/**
 * Subscription API method signatures for Better Auth Stripe plugin
 */
export type SubscriptionAPI = {
  listActiveSubscriptions: (args: {
    query: ListSubscriptionsQuery;
    headers: Record<string, string>;
  }) => Promise<BetterAuthSubscription[]>;
  upgradeSubscription: (args: {
    body: UpgradeSubscriptionBody;
    headers: Record<string, string>;
  }) => Promise<UpgradeSubscriptionResponse>;
  cancelSubscription: (args: {
    body: CancelSubscriptionBody;
    headers: Record<string, string>;
  }) => Promise<BetterAuthSubscription>;
  restoreSubscription?: (args: {
    body: RestoreSubscriptionBody;
    headers: Record<string, string>;
  }) => Promise<BetterAuthSubscription>;
};

// Response types manually defined to match snake_case DB columns
export type SubscriptionPlanResponse = {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  stripe_product_id: string;
  stripe_monthly_price_id: string | null;
  stripe_yearly_price_id: string | null;
  monthly_price: string | null;
  yearly_price: string | null;
  currency: string;
  features: string[];
  limits: {
    users: number;
    invoices_per_month: number;
    storage_gb: number;
  };
  metered_items?: Array<{
    price_id: string;
    meter_name: string;
    type: string;
  }> | null;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
  metadata?: Record<string, string> | null;
  created_at: Date;
  updated_at: Date;
};

export type SubscriptionResponse = {
  id: string;
  plan: string;
  reference_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  period_start: Date | null;
  period_end: Date | null;
  cancel_at_period_end: boolean | null;
  seats: number | null;
  trial_start: Date | null;
  trial_end: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type LineItemResponse = {
  id: string;
  subscription_id: string;
  stripe_subscription_item_id: string;
  stripe_price_id: string;
  item_type: string;
  description: string | null;
  quantity: number;
  unit_amount: string | null;
  metadata?: Record<string, string> | null;
  created_at: Date;
  updated_at: Date;
};

export type EventResponse = {
  id: string;
  subscription_id: string;
  plan_id: string | null;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  from_plan_id: string | null;
  to_plan_id: string | null;
  triggered_by: string | null;
  triggered_by_type: string | null;
  metadata?: Record<string, unknown> | null;
  error_message: string | null;
  created_at: Date;
};

export type SubscriptionWithDetailsResponse = Omit<SubscriptionResponse, 'plan'> & {
  plan: SubscriptionPlanResponse | null;
  line_items: LineItemResponse[];
  events: EventResponse[];
};

export type ListPlansResponse = {
  plans: SubscriptionPlanResponse[];
};

export type GetCurrentSubscriptionResponse = {
  subscription: SubscriptionWithDetailsResponse | null;
};

export type CreateSubscriptionResponse = {
  subscription_id?: string;
  checkout_url?: string;
  message: string;
};

export type CancelSubscriptionResponse = {
  subscription: SubscriptionResponse;
  message: string;
};
