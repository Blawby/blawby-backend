/**
 * Subscription Service
 *
 * Business logic for subscription management
 * Integrates with Better Auth Stripe plugin for subscription operations
 */

import { eq, and } from 'drizzle-orm';
import { getLogger } from '@logtape/logtape';

import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
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
import type { Result } from '@/shared/types/result';
import { ok, badRequest, notFound, internalError } from '@/shared/utils/result';

const logger = getLogger(['subscriptions', 'services', 'subscription']);

/**
 * List all available subscription plans
 */
const listPlans = async (): Promise<
  Result<Awaited<ReturnType<typeof subscriptionRepository.findAllActivePlans>>>
> => {
  try {
    const plans = await subscriptionRepository.findAllActivePlans(db);
    return ok(plans);
  } catch (error) {
    logger.error('Failed to list plans: {error}', { error });
    return internalError('Failed to retrieve subscription plans');
  }
};

/**
 * Get current subscription for an organization
 */
const getCurrentSubscription = async (
  organizationId: string,
  _user: User,
  _requestHeaders: Record<string, string>,
): Promise<Result<{
  subscription: Subscription | null;
  lineItems: any[];
  events: any[];
}>> => {
  try {
    // Get organization to find active subscription ID
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      return notFound('Organization not found');
    }

    // If no active subscription, return null
    if (!organization.activeSubscriptionId) {
      return ok({
        subscription: null,
        lineItems: [],
        events: [],
      });
    }

    // Get subscription from Better Auth database
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
      return ok({
        subscription: null,
        lineItems: [],
        events: [],
      });
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

    // Get line items and events from our database
    const lineItems = await subscriptionRepository.findLineItemsBySubscriptionId(
      db,
      subscription.id,
    );
    const events = await subscriptionRepository.findEventsBySubscriptionId(db, subscription.id);

    return ok({
      subscription,
      lineItems,
      events,
    });
  } catch (error) {
    logger.error('Failed to get current subscription for org {organizationId}: {error}', {
      organizationId,
      error
    });
    return internalError('Failed to retrieve current subscription');
  }
};

/**
 * Ensure Stripe customer exists for organization
 * Creates customer with organization's billing email if it doesn't exist
 */
const ensureOrganizationCustomer = async (
  organizationId: string,
  userEmail: string,
): Promise<Result<string>> => {
  try {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      return notFound('Organization not found');
    }

    // If customer already exists, return it
    if (organization.stripeCustomerId) {
      return ok(organization.stripeCustomerId);
    }

    // Create Stripe customer for organization
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

    return ok(customer.id);
  } catch (error) {
    logger.error('Failed to ensure organization customer for org {organizationId}: {error}', {
      organizationId,
      error
    });
    return internalError('Failed to setup billing customer');
  }
};

/**
 * Create a new subscription for an organization
 */
const createSubscription = async (
  organizationId: string,
  data: CreateSubscriptionRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{
  subscriptionId?: string;
  checkoutUrl?: string;
  message: string;
}>> => {
  try {
    const authInstance = createBetterAuthInstance(db);

    // Verify organization exists
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      return notFound('Organization not found');
    }

    // Fetch plan from database using planId
    const plan = await subscriptionRepository.findPlanById(db, data.planId);

    if (!plan) {
      return badRequest(`Plan not found with ID: ${data.planId}`);
    }

    if (!plan.isActive) {
      return badRequest(`Plan is not active: ${plan.name}`);
    }

    // Use plan name for Better Auth (Better Auth expects plan name, not UUID)
    const planName = plan.name;

    // Ensure Stripe customer exists for organization
    const customerResult = await ensureOrganizationCustomer(organizationId, user.email);
    if (!customerResult.success) {
      return customerResult;
    }

    // Check if organization already has an active subscription
    if (organization.activeSubscriptionId) {
      return badRequest('Organization already has an active subscription. Please manage your existing subscription.');
    }

    // Create subscription via Better Auth
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

    return ok({
      subscriptionId: result.subscriptionId,
      checkoutUrl: result.url,
      message: 'Subscription created successfully',
    });
  } catch (error) {
    logger.error('Failed to create subscription for org {organizationId}: {error}', {
      organizationId,
      error
    });
    return internalError('Failed to initiate subscription creation');
  }
};

/**
 * Cancel a subscription
 */
const cancelSubscription = async (
  subscriptionId: string,
  organizationId: string,
  data: CancelSubscriptionRequest,
  _user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ subscription: unknown; message: string }>> => {
  try {
    const authInstance = createBetterAuthInstance(db);

    // Verify organization exists
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      return notFound('Organization not found');
    }

    // Verify subscription belongs to organization
    if (organization.activeSubscriptionId !== subscriptionId) {
      return badRequest('Subscription does not belong to this organization');
    }

    // Cancel subscription via Better Auth
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

    return ok({
      subscription: result,
      message: data.immediately
        ? 'Subscription cancelled immediately'
        : 'Subscription will be cancelled at the end of the billing period',
    });
  } catch (error) {
    logger.error('Failed to cancel subscription {subscriptionId} for org {organizationId}: {error}', {
      subscriptionId,
      organizationId,
      error
    });
    return internalError('Failed to process subscription cancellation');
  }
};

export const subscriptionService = {
  listPlans,
  getCurrentSubscription,
  createSubscription,
  cancelSubscription,
};

export default subscriptionService;
