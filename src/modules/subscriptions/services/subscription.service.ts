/**
 * Subscription Service
 *
 * Business logic for subscription management
 * Integrates with Better Auth Stripe plugin for subscription operations
 */

import { eq, and } from 'drizzle-orm';

import { findAllActivePlans, findPlanById } from '@/modules/subscriptions/database/queries/subscriptionPlans.repository';
import { findBySubscriptionId as findLineItemsBySubscriptionId } from '@/modules/subscriptions/database/queries/subscriptionLineItems.repository';
import { findBySubscriptionId as findEventsBySubscriptionId } from '@/modules/subscriptions/database/queries/subscriptionEvents.repository';
import type {
  CreateSubscriptionRequest,
  CancelSubscriptionRequest,
  Subscription,
  SubscriptionAPI,
} from '@/modules/subscriptions/types/subscription.types';
import { organizations, subscriptions } from '@/schema/better-auth-schema';
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

  // Get subscription from Better Auth database
  // Better Auth stores subscriptions in the subscriptions table
  const [subscriptionRecord] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.id, organization.activeSubscriptionId),
        eq(subscriptions.referenceId, organizationId),
      ),
    )
    .limit(1);

  if (!subscriptionRecord) {
    return {
      subscription: null,
      lineItems: [],
      events: [],
    };
  }

  // Map database record to Subscription type
  const subscription: Subscription = {
    id: subscriptionRecord.id,
    status: subscriptionRecord.status,
    planId: subscriptionRecord.plan,
    currentPeriodEnd: subscriptionRecord.periodEnd
      ? Math.floor(subscriptionRecord.periodEnd.getTime() / 1000)
      : 0,
    cancelAtPeriodEnd: subscriptionRecord.cancelAtPeriodEnd || false,
    referenceId: subscriptionRecord.referenceId,
  };

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

  // Check if organization already has an active subscription
  if (organization.activeSubscriptionId) {
    // We could verify the status with Stripe here, but for now we trust our DB
    // activeSubscriptionId should only be set if the subscription is active/trialing
    // If we wanted to be 100% sure we could call getCurrentSubscription, but that might be overkill
    // as activeSubscriptionId is managed by webhooks.

    // However, let's at least double check if we can get the subscription details to be nice
    // Reuse existing logic or just block.
    // Blocking is safer to prevent the "double click" race condition mostly.
    throw new Error('Organization already has an active subscription. Please manage your existing subscription.');
  }

  // Create subscription via Better Auth
  // Better Auth will:
  // 1. Find or create customer (it will find our pre-created customer via referenceId lookup)
  // 2. Create Stripe Checkout session
  // 3. Return checkout URL
  //
  // NOTE: Unlike organization plugin methods (createOrganization, listOrganizations, etc.),
  // Stripe plugin methods are NOT automatically typed in BetterAuthInstance['api'].
  // This is why we need type assertion - the methods exist at runtime but TypeScript doesn't know about them.
  // See subscription.types.ts for explanation of why we can't infer types like practice.types.ts does.
  const api = authInstance.api as unknown as SubscriptionAPI;
  const result = await api.upgradeSubscription({
    body: {
      plan: planName,
      referenceId: organizationId,
      customerType: 'organization',
      successUrl: data.successUrl || '/dashboard',
      cancelUrl: data.cancelUrl || '/pricing',
      disableRedirect: data.disableRedirect || false,
    },
    headers: requestHeaders,
  });

  return {
    subscriptionId: result.subscriptionId,
    checkoutUrl: result.url,
    message: 'Subscription created successfully',
  };
};

/**
 * Cancel a subscription
 */
export const cancelSubscription = async (
  subscriptionId: string,
  organizationId: string,
  data: CancelSubscriptionRequest,
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
  // Better Auth redirects to Stripe Billing Portal for cancellation management
  // Note: The `immediately` flag from our API is informational only
  // Actual cancellation timing is managed through Stripe's Billing Portal
  const subscriptionAPI = authInstance.api as unknown as SubscriptionAPI;
  const result = await subscriptionAPI.cancelSubscription({
    body: {
      subscriptionId,
      referenceId: organizationId,
      customerType: 'organization',
      returnUrl: data.returnUrl || '/dashboard',
    },
    headers: requestHeaders,
  });

  return {
    subscription: result,
    message: data.immediately
      ? 'Subscription cancelled immediately'
      : 'Subscription will be cancelled at the end of the billing period',
  };
};

