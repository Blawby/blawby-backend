import { getLogger } from '@logtape/logtape';
import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
import { asc, eq } from 'drizzle-orm';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import { stripePrices } from '@/modules/subscriptions/database/schema/stripe-prices.schema';
import { subscriptionEvents } from '@/modules/subscriptions/database/schema/subscription-events.schema';
import { subscriptionLineItems } from '@/modules/subscriptions/database/schema/subscription-line-items.schema';
import { createBillingPortalSession } from '@/modules/subscriptions/services/billing-portal.service';
import type {
  CancelSubscriptionRequest,
  GetCurrentSubscriptionResponse,
  SubscriptionPlanResponse,
  LineItemResponse,
  EventResponse,
} from '@/modules/subscriptions/types/subscription.types';
import { organizations } from '@/schema/better-auth-schema';
import { subscriptions } from '@/modules/subscriptions/database/schema/subscriptions.schema';
import { db } from '@/shared/database';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['subscriptions', 'services', 'subscription']);

const shouldLogSubscriptionError = (error: unknown): boolean => {
  if (!(error instanceof HTTPException)) {
    return true;
  }
  return error.status >= 500;
};

const isRecordStringString = (obj: unknown): obj is Record<string, string> => {
  if (typeof obj !== 'object' || obj === null) return false;
  return Object.values(obj).every((val) => typeof val === 'string');
};

const isRecordStringUnknown = (obj: unknown): obj is Record<string, unknown> => typeof obj === 'object' && obj !== null;

const assertSubscriptionReadAccess = (ctx: ServiceContext): void => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Subscription');
};

const assertSubscriptionManageAccess = (ctx: ServiceContext): void => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('manage', 'Subscription');
};

const parseMetadata = <T>(data: unknown, guard: (obj: unknown) => obj is T): T | null => {
  if (data === null || data === undefined) return null;
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
 * List all available subscription plans.
 * Groups active stripe_prices by stripe_product_id; each product becomes one "plan" entry.
 */
const listPlans = async (): Promise<{ plans: SubscriptionPlanResponse[] }> => {
  const allPrices = await db
    .select()
    .from(stripePrices)
    .where(eq(stripePrices.is_active, true))
    .orderBy(asc(stripePrices.sort_order));

  const productMap = new Map<string, typeof allPrices>();
  for (const price of allPrices) {
    const list = productMap.get(price.stripe_product_id) ?? [];
    list.push(price);
    productMap.set(price.stripe_product_id, list);
  }

  const response: SubscriptionPlanResponse[] = [];
  for (const prices of productMap.values()) {
    const rep = prices.find((p) => p.usage_type === 'licensed') ?? prices[0];
    if (!rep?.name) continue;

    const monthlyPrice = prices.find((p) => p.usage_type === 'licensed' && p.interval === 'month');
    const yearlyPrice = prices.find((p) => p.usage_type === 'licensed' && p.interval === 'year');
    const meteredPrices = prices.filter((p) => p.usage_type === 'metered');
    const currency = monthlyPrice?.currency ?? yearlyPrice?.currency ?? '';

    response.push({
      id: rep.id,
      name: rep.name,
      display_name: rep.display_name ?? rep.name,
      description: rep.description ?? null,
      stripe_product_id: rep.stripe_product_id,
      stripe_monthly_price_id: monthlyPrice?.stripe_price_id ?? null,
      stripe_yearly_price_id: yearlyPrice?.stripe_price_id ?? null,
      monthly_price: monthlyPrice?.unit_amount ?? null,
      yearly_price: yearlyPrice?.unit_amount ?? null,
      currency,
      features: rep.features ?? [],
      limits: rep.limits ?? { users: 0, invoices_per_month: 0, storage_gb: 0 },
      metered_items: meteredPrices.length
        ? meteredPrices.map((p) => ({ price_id: p.stripe_price_id, meter_name: p.meter_name, type: p.internal_type }))
        : null,
      is_active: rep.is_active,
      is_public: rep.is_public ?? true,
      sort_order: rep.sort_order ?? 0,
      metadata: rep.metadata ?? null,
      image: rep.image ?? null,
      created_at: rep.created_at,
      updated_at: rep.updated_at,
    });
  }

  response.sort((a, b) => a.sort_order - b.sort_order);
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
          cancel_at: subscriptions.cancelAt,
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

    if (!organizationData.subscription) {
      return { subscription: null };
    }

    const subscriptionRecord = organizationData.subscription;

    const [lineItems, events, repPrice] = await Promise.all([
      db.query.subscriptionLineItems.findMany({
        where: eq(subscriptionLineItems.subscription_id, subscriptionRecord.id),
      }),
      db.query.subscriptionEvents.findMany({
        where: eq(subscriptionEvents.subscription_id, subscriptionRecord.id),
      }),
      subscriptionRepository.findPriceByName(db, subscriptionRecord.plan),
    ]);

    const { plan: _plan, ...subscriptionRecordWithoutPlanName } = subscriptionRecord;

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

    let planResponse: SubscriptionPlanResponse | null = null;
    if (repPrice) {
      const allPrices = await subscriptionRepository.findPricesByProductId(db, repPrice.stripe_product_id);
      const monthlyPrice = allPrices.find((p) => p.usage_type === 'licensed' && p.interval === 'month');
      const yearlyPrice = allPrices.find((p) => p.usage_type === 'licensed' && p.interval === 'year');
      const meteredPrices = allPrices.filter((p) => p.usage_type === 'metered');
      const currency = monthlyPrice?.currency ?? yearlyPrice?.currency ?? '';

      planResponse = {
        id: repPrice.id,
        name: repPrice.name ?? subscriptionRecord.plan,
        display_name: repPrice.display_name ?? repPrice.name ?? subscriptionRecord.plan,
        description: repPrice.description ?? null,
        stripe_product_id: repPrice.stripe_product_id,
        stripe_monthly_price_id: monthlyPrice?.stripe_price_id ?? null,
        stripe_yearly_price_id: yearlyPrice?.stripe_price_id ?? null,
        monthly_price: monthlyPrice?.unit_amount ?? null,
        yearly_price: yearlyPrice?.unit_amount ?? null,
        currency,
        features: repPrice.features ?? [],
        limits: repPrice.limits ?? { users: 0, invoices_per_month: 0, storage_gb: 0 },
        metered_items: meteredPrices.length
          ? meteredPrices.map((p) => ({ price_id: p.stripe_price_id, meter_name: p.meter_name, type: p.internal_type }))
          : null,
        is_active: repPrice.is_active,
        is_public: repPrice.is_public ?? true,
        sort_order: repPrice.sort_order ?? 0,
        metadata: repPrice.metadata ?? null,
        image: repPrice.image ?? null,
        created_at: repPrice.created_at,
        updated_at: repPrice.updated_at,
      };
    }

    return {
      subscription: {
        ...subscriptionRecordWithoutPlanName,
        line_items: mappedLineItems,
        events: mappedEvents,
        plan: planResponse,
      },
    };
  } catch (error) {
    if (shouldLogSubscriptionError(error)) {
      logger.error('Failed to get current subscription for org {organizationId}: {error}', { organizationId, error });
    }
    throw error;
  }
};

/**
 * Cancel a subscription — delegates to billing portal service.
 */
const cancelSubscription = async (
  { data }: { data: CancelSubscriptionRequest },
  ctx: ServiceContext
): Promise<{ url: string; redirect: boolean }> => {
  assertSubscriptionManageAccess(ctx);

  try {
    if (!ctx.organizationId) {
      throw new HTTPException(400, { message: 'No active organization. Please select an organization first.' });
    }
    return await createBillingPortalSession(
      { returnUrl: data.return_url || '/dashboard', immediately: data.immediately ?? false },
      ctx
    );
  } catch (error) {
    if (shouldLogSubscriptionError(error)) {
      logger.error('Failed to cancel subscription for org {organizationId}: {error}', {
        organizationId: ctx.organizationId,
        error,
      });
    }
    throw error;
  }
};

export const subscriptionService = {
  listPlans,
  getCurrentSubscription,
  cancelSubscription,
};
