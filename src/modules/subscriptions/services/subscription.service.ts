/**
 * Subscription Service
 *
 * Business logic for subscription management
 * Integrates with Better Auth Stripe plugin for subscription operations
 */

import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import { subscriptionEvents } from '@/modules/subscriptions/database/schema/subscriptionEvents.schema';
import { subscriptionLineItems } from '@/modules/subscriptions/database/schema/subscriptionLineItems.schema';
import type {
  CancelSubscriptionRequest,
  SubscriptionAPI,
  CreateSubscriptionRequest,
  GetCurrentSubscriptionResponse,
  SubscriptionPlanResponse,
  LineItemResponse,
  EventResponse,
  SubscriptionResponse,
  BetterAuthSubscription,
} from '@/modules/subscriptions/types/subscription.types';
import { organizations, subscriptions } from '@/schema/better-auth-schema';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import type { User } from '@/shared/types/BetterAuth';
import type { Result } from '@/shared/types/result';
import { ok, badRequest, notFound, internalError } from '@/shared/utils/result';

const logger = getLogger(['subscriptions', 'services', 'subscription']);

/**
 * Helper to safely cast authed API to SubscriptionAPI
 */
const getSubscriptionApi = (authInstance: ReturnType<typeof createBetterAuthInstance>): SubscriptionAPI => {
  return authInstance.api as unknown as SubscriptionAPI;
};

// Helper to map Better Auth camelCase subscription to our snake_case response
const mapToSubscriptionResponse = (sub: BetterAuthSubscription): SubscriptionResponse => ({
  id: sub.id,
  plan: sub.plan,
  reference_id: sub.referenceId,
  stripe_customer_id: sub.stripeCustomerId,
  stripe_subscription_id: sub.stripeSubscriptionId,
  status: sub.status,
  period_start: sub.periodStart,
  period_end: sub.periodEnd,
  cancel_at_period_end: sub.cancelAtPeriodEnd,
  seats: sub.seats,
  trial_start: sub.trialStart,
  trial_end: sub.trialEnd,
  created_at: sub.createdAt,
  updated_at: sub.updatedAt,
});

/**
 * List all available subscription plans
 */
const listPlans = async (): Promise<Result<{ plans: SubscriptionPlanResponse[] }>> => {
  try {
    const plans = await subscriptionRepository.findAllActivePlans(db);

    // The repository returns plans which are already snake_case in the schema
    // so we can return them directly.
    return ok({
      plans: plans as SubscriptionPlanResponse[],
    });
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
): Promise<Result<GetCurrentSubscriptionResponse>> => {
  try {
    // Manual query to handle text vs uuid type mismatch in database
    // We fetch the organization and join with subscription using explicit casting
    // Select all fields with explicit snake_case aliases to match our custom types
    const result = await db
      .select({
        activeSubscriptionId: organizations.activeSubscriptionId,
        subscription: {
          id: subscriptions.id,
          plan: subscriptions.plan,
          reference_id: subscriptions.referenceId,
          stripe_customer_id: subscriptions.stripeCustomerId,
          stripe_subscription_id: subscriptions.stripeSubscriptionId,
          status: subscriptions.status,
          period_start: subscriptions.periodStart,
          period_end: subscriptions.periodEnd,
          cancel_at_period_end: subscriptions.cancelAtPeriodEnd,
          seats: subscriptions.seats,
          trial_start: subscriptions.trialStart,
          trial_end: subscriptions.trialEnd,
          created_at: subscriptions.createdAt,
          updated_at: subscriptions.updatedAt,
        },
      })
      .from(organizations)
      .leftJoin(
        subscriptions,
        eq(organizations.activeSubscriptionId, subscriptions.id),
      )
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const organizationData = result[0];

    if (!organizationData) {
      return notFound('Organization not found');
    }

    // If no active subscription, return null
    if (!organizationData.subscription) {
      return ok({
        subscription: null,
      });
    }

    const subscriptionRecord = organizationData.subscription;

    // Fetch line items, events, and plan details
    const [lineItems, events, planResult] = await Promise.all([
      db.query.subscriptionLineItems.findMany({
        where: eq(subscriptionLineItems.subscription_id, subscriptionRecord.id),
      }),
      db.query.subscriptionEvents.findMany({
        where: eq(subscriptionEvents.subscription_id, subscriptionRecord.id),
      }),
      subscriptionRepository.findPlanByName(db, subscriptionRecord.plan),
    ]);

    const { plan: _, ...subscriptionRecordWithoutPlanName } = subscriptionRecord;

    // Map DB rows to response types to avoid unsafe casts
    const mappedLineItems: LineItemResponse[] = lineItems.map((item) => ({
      id: item.id,
      subscription_id: item.subscription_id,
      stripe_subscription_item_id: item.stripe_subscription_item_id,
      stripe_price_id: item.stripe_price_id,
      item_type: item.item_type,
      description: item.description,
      quantity: item.quantity,
      unit_amount: item.unit_amount,
      metadata: item.metadata as Record<string, string> | null,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));

    const mappedEvents: EventResponse[] = events.map((event) => ({
      id: event.id,
      subscription_id: event.subscription_id,
      plan_id: event.plan_id,
      event_type: event.event_type,
      from_status: event.from_status,
      to_status: event.to_status,
      from_plan_id: event.from_plan_id,
      to_plan_id: event.to_plan_id,
      triggered_by: event.triggered_by,
      triggered_by_type: event.triggered_by_type,
      metadata: event.metadata as Record<string, unknown> | null,
      error_message: event.error_message,
      created_at: event.created_at,
    }));

    // Construct the response by spreading the raw DB record (which contains snake_case keys from the aliased select)
    // and adding the details. The 'plan' from the DB record is just a string name,
    // we override it here with the full plan object.
    return ok({
      subscription: {
        ...subscriptionRecordWithoutPlanName,
        line_items: mappedLineItems,
        events: mappedEvents,
        plan: planResult
          ? {
            ...planResult,
            metadata: planResult.metadata ?? null,
            metered_items: planResult.metered_items ?? null,
          }
          : null,
      },
    });
  } catch (error) {
    logger.error('Failed to get current subscription for org {organizationId}: {error}', {
      organizationId,
      error,
    });
    return internalError('Failed to retrieve current subscription');
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


    // Check if organization already has an active subscription
    if (organization.activeSubscriptionId) {
      return badRequest('Organization already has an active subscription. Please manage your existing subscription.');
    }

    // Create subscription via Better Auth
    const api = getSubscriptionApi(authInstance);
    const result = await api.upgradeSubscription({
      body: {
        plan: planName,
        reference_id: organizationId,
        customer_type: 'organization',
        success_url: data.success_url || '/dashboard',
        cancel_url: data.cancel_url || '/pricing',
        disable_redirect: data.disable_redirect || false,
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
): Promise<Result<{ subscription: SubscriptionResponse; message: string }>> => {
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
    const subscriptionAPI = getSubscriptionApi(authInstance);
    const result = await subscriptionAPI.cancelSubscription({
      body: {
        subscription_id: subscriptionId,
        reference_id: organizationId,
        customer_type: 'organization',
        return_url: data.return_url || '/dashboard',
        immediately: data.immediately ?? false,
      },
      headers: requestHeaders,
    });

    return ok({
      subscription: mapToSubscriptionResponse(result),
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
