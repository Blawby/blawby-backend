/**
 * Subscription Service
 *
 * Business logic for subscription management
 * Integrates with Better Auth Stripe plugin for subscription operations
 */

import { eq } from 'drizzle-orm';

import { findAllActivePlans, findPlanById } from '@/modules/subscriptions/database/queries/subscriptionPlans.repository';
import { findBySubscriptionId as findLineItemsBySubscriptionId } from '@/modules/subscriptions/database/queries/subscriptionLineItems.repository';
import { findBySubscriptionId as findEventsBySubscriptionId } from '@/modules/subscriptions/database/queries/subscriptionEvents.repository';
import type {
  CreateSubscriptionRequest,
  CancelSubscriptionBody,
} from '@/modules/subscriptions/types/subscription.types';
import { organizations } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import type { User } from '@/shared/types/BetterAuth';

/**
 * List all available subscription plans
 */
export const listPlans = async (): Promise<
  Awaited<ReturnType<typeof findAllActivePlans>>
> => {
  return await findAllActivePlans(db);
};

/**
 * Get current subscription for an organization
 */
export const getCurrentSubscription = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<{
  subscription: unknown | null;
  lineItems: unknown[];
  events: unknown[];
}> => {
  const authInstance = createBetterAuthInstance(db);

  // Get organization to find active subscription ID
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) {
    throw new Error('Organization not found');
  }

  // If no active subscription, return null
  if (!organization.activeSubscriptionId) {
    return {
      subscription: null,
      lineItems: [],
      events: [],
    };
  }

  // Get subscription from Better Auth
  // Better Auth stores subscriptions internally, we'll query by referenceId
  // Type assertion needed because Better Auth Stripe plugin types may not be fully exposed
  const api = authInstance.api as Record<string, unknown>;
  const listSubscriptions = api.listSubscriptions as (args: {
    query: { referenceId: string };
    headers: Record<string, string>;
  }) => Promise<{
    data?: Array<{ id: string; referenceId: string | null }>;
    error?: { message: string };
  }>;

  const { data: subscriptions, error } = await listSubscriptions({
    query: {
      referenceId: organizationId,
    },
    headers: requestHeaders,
  });

  if (error) {
    throw new Error(error.message || 'Failed to fetch subscription');
  }

  // Find the active subscription
  const subscription = subscriptions?.find(
    (sub: { id: string }) => sub.id === organization.activeSubscriptionId,
  );

  if (!subscription) {
    return {
      subscription: null,
      lineItems: [],
      events: [],
    };
  }

  // Get line items and events from our database
  const lineItems = await findLineItemsBySubscriptionId(
    db,
    subscription.id,
  );
  const events = await findEventsBySubscriptionId(db, subscription.id);

  return {
    subscription,
    lineItems,
    events,
  };
};

/**
 * Ensure Stripe customer exists for organization
 * Creates customer with organization's billing email if it doesn't exist
 */
const ensureOrganizationCustomer = async (
  organizationId: string,
  userEmail: string,
): Promise<string> => {
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) {
    throw new Error('Organization not found');
  }

  // If customer already exists, return it
  if (organization.stripeCustomerId) {
    return organization.stripeCustomerId;
  }

  // Create Stripe customer for organization
  // This ensures the customer is created with organization's billing email
  // Better Auth will find this customer when creating the subscription via referenceId
  const { getStripeInstance } = await import('@/shared/utils/stripe-client');
  const stripeInstance = getStripeInstance();

  const customer = await stripeInstance.customers.create({
    email: organization.billingEmail || userEmail,
    name: organization.name,
    metadata: {
      organization_id: organizationId,
      iolta_compliant: 'true',
      type: 'platform_billing',
    },
    // NO stripeAccount param = platform account (IOLTA compliant)
  });

  // Save customer ID to organization
  await db
    .update(organizations)
    .set({
      stripeCustomerId: customer.id,
    })
    .where(eq(organizations.id, organizationId));

  return customer.id;
};

/**
 * Create a new subscription for an organization
 */
export const createSubscription = async (
  organizationId: string,
  data: CreateSubscriptionRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<{
  subscriptionId?: string;
  checkoutUrl?: string;
  message: string;
}> => {
  const authInstance = createBetterAuthInstance(db);

  // Verify organization exists and user has access
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) {
    throw new Error('Organization not found');
  }

  // Fetch plan from database using planId
  const plan = await findPlanById(db, data.planId);

  if (!plan) {
    throw new Error(`Plan not found with ID: ${data.planId}`);
  }

  if (!plan.isActive) {
    throw new Error(`Plan is not active: ${plan.name}`);
  }

  // Use plan name for Better Auth (Better Auth expects plan name, not UUID)
  const planName = plan.name;

  // Ensure Stripe customer exists for organization
  // This creates the customer with organization's billing email if it doesn't exist
  // Better Auth will find this customer when creating the subscription via referenceId
  await ensureOrganizationCustomer(organizationId, user.email);

  // Create subscription via Better Auth
  // Better Auth will:
  // 1. Find or create customer (it will find our pre-created customer via referenceId lookup)
  // 2. Create Stripe Checkout session
  // 3. Return checkout URL
  // Type assertion needed because Better Auth Stripe plugin types may not be fully exposed
  const api = authInstance.api as Record<string, unknown>;
  const upgradeSubscription = api.upgradeSubscription as (args: {
    body: {
      plan: string;
      referenceId: string;
      successUrl: string;
      cancelUrl: string;
      disableRedirect: boolean;
    };
    headers: Record<string, string>;
  }) => Promise<{
    data?: { subscriptionId?: string; url?: string };
    error?: { message: string };
  }>;

  const result = await upgradeSubscription({
    body: {
      plan: planName,
      referenceId: organizationId,
      successUrl: data.successUrl || '/dashboard',
      cancelUrl: data.cancelUrl || '/pricing',
      disableRedirect: data.disableRedirect || false,
    },
    headers: requestHeaders,
  });

  if (result.error) {
    throw new Error(result.error.message || 'Failed to create subscription');
  }

  return {
    subscriptionId: result.data?.subscriptionId,
    checkoutUrl: result.data?.url,
    message: 'Subscription created successfully',
  };
};

/**
 * Cancel a subscription
 */
export const cancelSubscription = async (
  subscriptionId: string,
  organizationId: string,
  data: CancelSubscriptionBody,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<{ subscription: unknown; message: string }> => {
  const authInstance = createBetterAuthInstance(db);

  // Verify organization exists
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) {
    throw new Error('Organization not found');
  }

  // Verify subscription belongs to organization
  if (organization.activeSubscriptionId !== subscriptionId) {
    throw new Error('Subscription does not belong to this organization');
  }

  // Cancel subscription via Better Auth
  // Type assertion needed because Better Auth Stripe plugin types may not be fully exposed
  const api = authInstance.api as Record<string, unknown>;
  const cancelSubscription = api.cancelSubscription as (args: {
    body: {
      subscriptionId: string;
      immediately: boolean;
    };
    headers: Record<string, string>;
  }) => Promise<{
    data?: unknown;
    error?: { message: string };
  }>;

  const result = await cancelSubscription({
    body: {
      subscriptionId,
      immediately: data.immediately || false,
    },
    headers: requestHeaders,
  });

  if (result.error) {
    throw new Error(result.error.message || 'Failed to cancel subscription');
  }

  return {
    subscription: result.data || null,
    message: data.immediately
      ? 'Subscription cancelled immediately'
      : 'Subscription will be cancelled at the end of the billing period',
  };
};

/**
 * Get subscription by ID
 */
export const getSubscriptionById = async (
  subscriptionId: string,
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<{
  subscription: unknown;
  lineItems: unknown[];
  events: unknown[];
}> => {
  const authInstance = createBetterAuthInstance(db);

  // Verify organization exists
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) {
    throw new Error('Organization not found');
  }

  // Get subscription from Better Auth
  // Type assertion needed because Better Auth Stripe plugin types may not be fully exposed
  const api = authInstance.api as Record<string, unknown>;
  const listSubscriptions = api.listSubscriptions as (args: {
    query: { referenceId: string };
    headers: Record<string, string>;
  }) => Promise<{
    data?: Array<{ id: string; referenceId: string | null }>;
    error?: { message: string };
  }>;

  const { data: subscriptions, error } = await listSubscriptions({
    query: {
      referenceId: organizationId,
    },
    headers: requestHeaders,
  });

  if (error) {
    throw new Error(error.message || 'Failed to fetch subscription');
  }

  // Find the specific subscription
  const subscription = subscriptions?.find(
    (sub: { id: string; referenceId: string | null }) => sub.id === subscriptionId,
  );

  if (!subscription) {
    throw new Error('Subscription not found');
  }

  // Verify subscription belongs to organization
  if (subscription.referenceId !== organizationId) {
    throw new Error('Subscription does not belong to this organization');
  }

  // Get line items and events from our database
  const lineItems = await findLineItemsBySubscriptionId(db, subscriptionId);
  const events = await findEventsBySubscriptionId(db, subscriptionId);

  return {
    subscription,
    lineItems,
    events,
  };
};

