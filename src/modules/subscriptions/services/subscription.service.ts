/**
 * Subscription Service
 *
 * Business logic for subscription management
 * Integrates with Better Auth Stripe plugin for subscription operations
 */

import { getLogger } from '@logtape/logtape';
import { eq, and } from 'drizzle-orm';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import type {
  CreateSubscriptionRequest,
  CancelSubscriptionRequest,
  Subscription,
  SubscriptionAPI,
} from '@/modules/subscriptions/types/subscription.types';
import { organizations, subscriptions } from '@/schema/better-auth-schema';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
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
  line_items: any[];
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
        line_items: [],
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
        line_items: [],
        events: [],
      });
    }

    // Map database record to Subscription type with snake_case for API
    const planResult = await subscriptionRepository.findPlanByName(db, subscriptionRecord.plan);
    const subscription = {
      id: subscriptionRecord.id,
      status: subscriptionRecord.status,
      plan: planResult || null,
      current_period_start: subscriptionRecord.periodStart
        ? Math.floor(subscriptionRecord.periodStart.getTime() / 1000)
        : null,
      current_period_end: subscriptionRecord.periodEnd
        ? Math.floor(subscriptionRecord.periodEnd.getTime() / 1000)
        : null,
      cancel_at_period_end: subscriptionRecord.cancelAtPeriodEnd || false,
      reference_id: subscriptionRecord.referenceId,
      stripe_customer_id: subscriptionRecord.stripeCustomerId,
      stripe_subscription_id: subscriptionRecord.stripeSubscriptionId,
      created_at: subscriptionRecord.createdAt.toISOString(),
      updated_at: subscriptionRecord.updatedAt.toISOString(),
    };

    // Get line items and events from our database
    const line_items = await subscriptionRepository.findLineItemsBySubscriptionId(
      db,
      subscription.id,
    );
    const events = await subscriptionRepository.findEventsBySubscriptionId(db, subscription.id);

    return ok({
      subscription,
      line_items: line_items as any[],
      events: events as any[],
    } as any);
  } catch (error) {
    logger.error('Failed to get current subscription for org {organizationId}: {error}', {
      organizationId,
      error,
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

    // Create Stripe customer for organization with idempotency key to prevent duplicates
    const { getStripeInstance } = await import('@/shared/utils/stripe-client');
    const stripeInstance = getStripeInstance();
    const idempotencyKey = `org_customer_${organizationId}`;

    const customer = await stripeInstance.customers.create(
      {
        email: organization.billingEmail || userEmail,
        name: organization.name,
        metadata: {
          organization_id: organizationId,
          iolta_compliant: 'true',
          type: 'platform_billing',
        },
        // NO stripeAccount param = platform account (IOLTA compliant)
      },
      { idempotencyKey },
    );

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
      error,
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
  subscription_id?: string;
  checkout_url?: string;
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

    // Fetch plan from database using plan_id
    const plan = await subscriptionRepository.findPlanById(db, data.plan_id);

    if (!plan) {
      return badRequest(`Plan not found with ID: ${data.plan_id}`);
    }

    if (!plan.is_active) {
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
        successUrl: data.success_url || '/dashboard',
        cancelUrl: data.cancel_url || '/pricing',
        disableRedirect: data.disable_redirect || false,
      },
      headers: requestHeaders,
    });

    return ok({
      subscription_id: result.subscriptionId,
      checkout_url: result.url,
      message: 'Subscription created successfully',
    });
  } catch (error) {
    logger.error('Failed to create subscription for org {organizationId}: {error}', {
      organizationId,
      error,
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
        returnUrl: data.return_url || '/dashboard',
        immediately: data.immediately ?? false,
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
      error,
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
