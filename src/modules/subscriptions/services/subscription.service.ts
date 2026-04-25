/**
 * Subscription Service
 *
 * Business logic for subscription management
 * Integrates with Better Auth Stripe plugin for subscription operations
 */

import { getLogger } from '@logtape/logtape';
import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import { subscriptionEvents } from '@/modules/subscriptions/database/schema/subscriptionEvents.schema';
import { subscriptionLineItems } from '@/modules/subscriptions/database/schema/subscriptionLineItems.schema';
import type { SubscriptionPrice } from '@/modules/subscriptions/database/schema/subscriptionPrices.schema';
import type {
  CancelSubscriptionRequest,
  SubscriptionAPI,
  CreateSubscriptionRequest,
  GetCurrentSubscriptionResponse,
  SubscriptionPlanResponse,
  LineItemResponse,
  EventResponse,
} from '@/modules/subscriptions/types/subscription.types';
import { organizations, subscriptions } from '@/schema/better-auth-schema';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['subscriptions', 'services', 'subscription']);

/**
 * Helper to safely cast authed API to SubscriptionAPI
 */
const getSubscriptionApi = (authInstance: ReturnType<typeof createBetterAuthInstance>): SubscriptionAPI =>
  authInstance.api as unknown as SubscriptionAPI;

/**
 * Type guard for Record<string, string>
 */
const isRecordStringString = (obj: unknown): obj is Record<string, string> => {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  return Object.values(obj).every((val) => typeof val === 'string');
};

/**
 * Type guard for Record<string, unknown>
 */
const isRecordStringUnknown = (obj: unknown): obj is Record<string, unknown> => typeof obj === 'object' && obj !== null;

const assertSubscriptionReadAccess = (ctx: ServiceContext): void => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Subscription');
};

const assertSubscriptionManageAccess = (ctx: ServiceContext): void => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('manage', 'Subscription');
};

/**
 * Helper to safely parse and validate metadata
 */
const parseMetadata = <T>(data: unknown, guard: (obj: unknown) => obj is T): T | null => {
  if (data === null || data === undefined) {
    return null;
  }

  let parsed = data;
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }
  }

  return guard(parsed) ? parsed : null;
};

/**
 * List all available subscription plans
 */
const listPlans = async (): Promise<{ plans: SubscriptionPlanResponse[] }> => {
  const plans = await subscriptionRepository.findAllActivePlans(db);

  // Fetch prices for all plans in a single query to derive legacy pricing fields
  const planIds = plans.map((plan) => plan.id);
  const prices: SubscriptionPrice[] =
    planIds.length > 0 ? await subscriptionRepository.findPricesByPlanIds(db, planIds) : [];

  const pricesByPlan = prices.reduce<Record<string, SubscriptionPrice[]>>((planPriceMap, price) => {
    const planId = price.plan_id;
    if (!planId) {
      return planPriceMap;
    }
    planPriceMap[planId] ??= [];
    planPriceMap[planId].push(price);
    return planPriceMap;
  }, {});

  const response: SubscriptionPlanResponse[] = plans.map((plan) => {
    const planPrices = pricesByPlan[plan.id] ?? [];
    const currency = planPrices[0]?.currency ?? '';
    const monthlyPrice = planPrices.find((price) => price.interval === 'month');
    const yearlyPrice = planPrices.find((price) => price.interval === 'year');
    const meteredPrices = planPrices.filter((price) => price.usage_type === 'metered');

    return {
      id: plan.id,
      name: plan.name,
      display_name: plan.display_name,
      description: plan.description,
      stripe_product_id: plan.stripe_product_id,
      stripe_monthly_price_id: monthlyPrice?.stripe_price_id ?? null,
      stripe_yearly_price_id: yearlyPrice?.stripe_price_id ?? null,
      monthly_price: monthlyPrice ? monthlyPrice.unit_amount : null,
      yearly_price: yearlyPrice ? yearlyPrice.unit_amount : null,
      currency,
      features: plan.features,
      limits: plan.limits,
      metered_items: meteredPrices.length
        ? meteredPrices.map((meteredPrice) => ({
            price_id: meteredPrice.stripe_price_id,
            meter_name: meteredPrice.meter_name,
            type: meteredPrice.internal_type,
          }))
        : null,
      is_active: plan.is_active,
      is_public: plan.is_public,
      sort_order: plan.sort_order,
      metadata: plan.metadata,
      image: plan.image,
      created_at: plan.created_at,
      updated_at: plan.updated_at,
    };
  });

  return { plans: response };
};

/**
 * Get current subscription for an organization
 */
const getCurrentSubscription = async (
  _params: Record<string, never>,
  ctx: ServiceContext
): Promise<GetCurrentSubscriptionResponse> => {
  assertSubscriptionReadAccess(ctx);
  const { organizationId } = ctx;

  try {
    if (!organizationId) {
      throw new HTTPException(400, { message: 'No active organization. Please select an organization first.' });
    }

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
      .leftJoin(subscriptions, eq(organizations.activeSubscriptionId, subscriptions.id))
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const [organizationData] = result;

    if (!organizationData) {
      throw new HTTPException(404, { message: 'Organization not found' });
    }

    // If no active subscription, return null
    if (!organizationData.subscription) {
      return {
        subscription: null,
      };
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

    const { plan: _plan, ...subscriptionRecordWithoutPlanName } = subscriptionRecord;

    // Map DB rows to response types to avoid unsafe casts
    const mappedLineItems: LineItemResponse[] = lineItems.map((lineItem) => ({
      id: lineItem.id,
      subscription_id: lineItem.subscription_id,
      stripe_subscription_item_id: lineItem.stripe_subscription_item_id,
      stripe_price_id: lineItem.stripe_price_id,
      item_type: lineItem.item_type,
      description: lineItem.description,
      quantity: lineItem.quantity,
      unit_amount: lineItem.unit_amount,
      metadata: parseMetadata(lineItem.metadata, isRecordStringString),
      created_at: lineItem.created_at,
      updated_at: lineItem.updated_at,
    }));

    const mappedEvents: EventResponse[] = events.map((subscriptionEvent) => ({
      id: subscriptionEvent.id,
      subscription_id: subscriptionEvent.subscription_id,
      plan_id: subscriptionEvent.plan_id,
      event_type: subscriptionEvent.event_type,
      from_status: subscriptionEvent.from_status,
      to_status: subscriptionEvent.to_status,
      from_plan_id: subscriptionEvent.from_plan_id,
      to_plan_id: subscriptionEvent.to_plan_id,
      triggered_by: subscriptionEvent.triggered_by,
      triggered_by_type: subscriptionEvent.triggered_by_type,
      metadata: parseMetadata(subscriptionEvent.metadata, isRecordStringUnknown),
      error_message: subscriptionEvent.error_message,
      created_at: subscriptionEvent.created_at,
    }));

    // Map plan to response format
    let planResponse: SubscriptionPlanResponse | null = null;
    if (planResult) {
      const planPrices = await subscriptionRepository.findPricesByPlanId(db, planResult.id);
      const currency = planPrices[0]?.currency ?? '';
      const monthlyPrice = planPrices.find((price) => price.interval === 'month');
      const yearlyPrice = planPrices.find((price) => price.interval === 'year');
      const meteredPrices = planPrices.filter((price) => price.usage_type === 'metered');

      planResponse = {
        id: planResult.id,
        name: planResult.name,
        display_name: planResult.display_name,
        description: planResult.description,
        stripe_product_id: planResult.stripe_product_id,
        stripe_monthly_price_id: monthlyPrice?.stripe_price_id ?? null,
        stripe_yearly_price_id: yearlyPrice?.stripe_price_id ?? null,
        monthly_price: monthlyPrice ? monthlyPrice.unit_amount : null,
        yearly_price: yearlyPrice ? yearlyPrice.unit_amount : null,
        currency,
        features: planResult.features,
        limits: planResult.limits,
        metered_items: meteredPrices.length
          ? meteredPrices.map((meteredPrice) => ({
              price_id: meteredPrice.stripe_price_id,
              meter_name: meteredPrice.meter_name,
              type: meteredPrice.internal_type,
            }))
          : null,
        is_active: planResult.is_active,
        is_public: planResult.is_public,
        sort_order: planResult.sort_order,
        metadata: planResult.metadata ?? null,
        image: planResult.image,
        created_at: planResult.created_at,
        updated_at: planResult.updated_at,
      };
    }

    // Construct the response
    return {
      subscription: {
        ...subscriptionRecordWithoutPlanName,
        line_items: mappedLineItems,
        events: mappedEvents,
        plan: planResponse,
      },
    };
  } catch (error) {
    logger.error('Failed to get current subscription for org {organizationId}: {error}', {
      organizationId,
      error,
    });
    throw error;
  }
};

/**
 * Create a new subscription for an organization
 */
const createSubscription = async (
  { organizationId, data }: { organizationId: string; data: CreateSubscriptionRequest },
  ctx: ServiceContext
): Promise<{
  subscription_id?: string;
  checkout_url?: string;
  message: string;
}> => {
  assertSubscriptionManageAccess(ctx);

  try {
    const authInstance = createBetterAuthInstance(db);

    // Verify organization exists
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);

    if (!organization) {
      throw new HTTPException(404, { message: 'Organization not found' });
    }

    // Fetch plan from database using plan_id
    const plan = await subscriptionRepository.findPlanById(db, data.plan_id);

    if (!plan) {
      throw new HTTPException(400, { message: `Plan not found with ID: ${data.plan_id}` });
    }

    if (!plan.is_active) {
      throw new HTTPException(400, { message: `Plan is not active: ${plan.name}` });
    }

    // Use plan name for Better Auth (Better Auth expects plan name, not UUID)
    const planName = plan.name;

    // Check if organization already has an active subscription
    if (organization.activeSubscriptionId) {
      throw new HTTPException(400, {
        message: 'Organization already has an active subscription. Please manage your existing subscription.',
      });
    }

    // Create subscription via Better Auth
    const api = getSubscriptionApi(authInstance);
    const result = await api.upgradeSubscription({
      body: {
        plan: planName,
        reference_id: organizationId,
        customer_type: 'organization',
        success_url: data.success_url ?? '/dashboard',
        cancel_url: data.cancel_url ?? '/pricing',
        disable_redirect: data.disable_redirect || false,
      },
      headers: ctx.requestHeaders,
    });

    return {
      subscription_id: result.subscriptionId,
      checkout_url: result.url,
      message: 'Subscription created successfully',
    };
  } catch (error) {
    logger.error('Failed to create subscription for org {organizationId}: {error}', {
      organizationId,
      error,
    });
    throw error;
  }
};

/**
 * Cancel a subscription
 *
 * If subscriptionId is not provided, it cancels the organization's active subscription.
 */
const cancelSubscription = async (
  { data }: { data: CancelSubscriptionRequest },
  ctx: ServiceContext
): Promise<{ url: string; redirect: boolean }> => {
  assertSubscriptionManageAccess(ctx);
  const { organizationId } = ctx;

  try {
    if (!organizationId) {
      throw new HTTPException(400, { message: 'No active organization. Please select an organization first.' });
    }

    const authInstance = createBetterAuthInstance(db);

    const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);

    if (!organization) {
      throw new HTTPException(404, { message: 'Organization not found' });
    }

    if (!organization.activeSubscriptionId) {
      throw new HTTPException(400, { message: 'No active subscription found for this organization' });
    }

    // Cancel subscription via Better Auth
    const subscriptionAPI = getSubscriptionApi(authInstance);
    // Better Auth expects camelCase body parameters
    const result = await subscriptionAPI.cancelSubscription({
      body: {
        referenceId: organizationId,
        customerType: 'organization',
        returnUrl: data.return_url || '/dashboard',
        immediately: data.immediately ?? false,
      },
      headers: ctx.requestHeaders,
    });

    return {
      url: result.url,
      redirect: result.redirect,
    };
  } catch (error) {
    logger.error('Failed to cancel subscription for org {organizationId}: {error}', {
      organizationId,
      error,
    });
    throw error;
  }
};

export const subscriptionService = {
  listPlans,
  getCurrentSubscription,
  createSubscription,
  cancelSubscription,
};
