import type { User } from '@/shared/types/BetterAuth';
import type { SubscriptionPlan } from '@/modules/subscriptions/database/schema/subscriptionPlans.schema';

/**
 * Subscription API request types
 * Note: Better Auth Stripe plugin types may not be fully exposed,
 * so we define these explicitly based on the plugin's expected interface
 */
export type UpgradeSubscriptionRequest = {
  plan: string;
  referenceId: string;
  successUrl?: string;
  cancelUrl?: string;
  disableRedirect?: boolean;
};

export type CancelSubscriptionRequest = {
  subscriptionId: string;
  immediately?: boolean;
};

/**
 * Subscription response types
 */
export type SubscriptionResponse = {
  id: string;
  referenceId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string;
  plan: SubscriptionPlan | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SubscriptionWithDetails = SubscriptionResponse & {
  lineItems: Array<{
    id: string;
    stripePriceId: string;
    itemType: string;
    quantity: number;
    unitAmount: string | null;
    description: string | null;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    toStatus: string | null;
    triggeredByType: string;
    createdAt: Date;
  }>;
};

export type CreateSubscriptionRequest = {
  planId: string; // UUID of the plan
  plan?: string; // Optional plan name (fallback)
  successUrl?: string;
  cancelUrl?: string;
  disableRedirect?: boolean;
};

export type CancelSubscriptionBody = {
  immediately?: boolean;
  reason?: string;
};

export type SubscriptionServiceContext = {
  user: User;
  requestHeaders: Record<string, string>;
};

