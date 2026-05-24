import { getLogger } from '@logtape/logtape';
import { eq, and, inArray, or, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Stripe } from 'stripe';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import { stripePrices } from '@/modules/subscriptions/database/schema/stripe-prices.schema';
import { PRACTICE_ENTITLED_STATUSES } from '@/modules/subscriptions/constants/subscription-statuses';
import * as schema from '@/schema';
import { db } from '@/shared/database';
import { SubscriptionCreated } from '@/shared/events/definitions';
import { getStripeInstance } from '@/shared/utils/stripe-client';
import { fromStripeTimestamp } from '@/shared/utils/timestamps';

const logger = getLogger(['subscriptions', 'lifecycle']);

type DbOrTx = NodePgDatabase<typeof schema>;

// ---------------------------------------------------------------------------
// syncSubscriptionToOrg
// ---------------------------------------------------------------------------

export const syncSubscriptionToOrg = async (
  dbOrTx: DbOrTx,
  params: {
    stripeSubscription: Stripe.Subscription;
    subscriptionId: string;
    referenceId: string | null;
    stripeCustomerId?: string | null;
    planName: string;
    eventType: 'created' | 'active' | 'updated';
    trigger: 'webhook' | 'user';
  }
): Promise<void> => {
  const { stripeSubscription, subscriptionId, referenceId, stripeCustomerId, planName, eventType, trigger } = params;

  const customerId =
    stripeCustomerId ?? (typeof stripeSubscription.customer === 'string' ? stripeSubscription.customer : null);

  if (!customerId) {
    logger.warn('No customer ID found for subscription {subscriptionId}, skipping sync.', { subscriptionId });
    return;
  }

  let organizationId = referenceId;
  if (!organizationId) {
    logger.warn('No referenceId provided, looking up org by customerId: {customerId}', { customerId });
    const org = await dbOrTx
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.stripeCustomerId, customerId))
      .limit(1);
    organizationId = org[0]?.id ?? null;
  }

  if (!organizationId) {
    logger.warn('No organization found for referenceId: {referenceId} or customerId: {customerId}', {
      referenceId,
      customerId,
    });
    return;
  }

  const hadCreatedEvent =
    (await subscriptionRepository.findEventsBySubscriptionIdAndType(dbOrTx, subscriptionId, 'created')).length > 0;
  let subscriptionSynced = false;
  const stripeIdsToCancel: string[] = [];
  let cancelIncomingAndStop = false;

  await dbOrTx.transaction(async (tx) => {
    const [existingOrg] = await tx
      .select({ activeSubscriptionId: schema.organizations.activeSubscriptionId })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);

    if (existingOrg?.activeSubscriptionId && existingOrg.activeSubscriptionId !== subscriptionId) {
      const [oldSub] = await tx
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, existingOrg.activeSubscriptionId))
        .limit(1);

      if (oldSub) {
        const incomingCreated = fromStripeTimestamp(stripeSubscription.created);
        const existingCreated = oldSub.createdAt;

        if (incomingCreated < existingCreated) {
          logger.warn(
            'Race condition: incoming subscription {incomingId} is OLDER than active {existingId}. Canceling incoming.',
            { incomingId: subscriptionId, existingId: oldSub.id }
          );
          await tx
            .update(schema.subscriptions)
            .set({ status: 'canceled', updatedAt: new Date() })
            .where(eq(schema.subscriptions.id, subscriptionId));
          stripeIdsToCancel.push(stripeSubscription.id);
          cancelIncomingAndStop = true;
          return;
        } else {
          logger.warn(
            'Race condition: incoming subscription {incomingId} is NEWER than active {existingId}. Canceling existing.',
            { incomingId: subscriptionId, existingId: oldSub.id }
          );
          await tx
            .update(schema.subscriptions)
            .set({ status: 'canceled', updatedAt: new Date() })
            .where(eq(schema.subscriptions.id, oldSub.id));
          if (oldSub.stripeSubscriptionId) {
            stripeIdsToCancel.push(oldSub.stripeSubscriptionId);
          }
        }
      }
    }

    // Update org's active subscription pointer and customer ID
    const updated = await tx
      .update(schema.organizations)
      .set({ stripeCustomerId: customerId, activeSubscriptionId: subscriptionId })
      .where(eq(schema.organizations.id, organizationId))
      .returning({ id: schema.organizations.id });

    if (updated.length === 0) {
      throw new Error(`Failed to update organization ${organizationId} during subscription sync`);
    }

    // Sync subscription row fields
    await tx
      .update(schema.subscriptions)
      .set({
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId: customerId,
        status: stripeSubscription.status,
        periodStart: stripeSubscription.items.data[0]?.current_period_start
          ? fromStripeTimestamp(stripeSubscription.items.data[0].current_period_start)
          : null,
        periodEnd: stripeSubscription.items.data[0]?.current_period_end
          ? fromStripeTimestamp(stripeSubscription.items.data[0].current_period_end)
          : null,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        cancelAt: stripeSubscription.cancel_at ? fromStripeTimestamp(stripeSubscription.cancel_at) : null,
        trialStart: stripeSubscription.trial_start ? fromStripeTimestamp(stripeSubscription.trial_start) : null,
        trialEnd: stripeSubscription.trial_end ? fromStripeTimestamp(stripeSubscription.trial_end) : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.id, subscriptionId));

    // Sync line items
    if (stripeSubscription.items?.data) {
      await Promise.all(
        stripeSubscription.items.data.map((item) =>
          subscriptionRepository.upsertLineItem(tx, {
            subscription_id: subscriptionId,
            stripe_subscription_item_id: item.id,
            stripe_price_id: item.price.id,
            item_type: 'base_fee',
            description: item.price.nickname ?? item.price.product?.toString(),
            quantity: item.quantity ?? 1,
            unit_amount: item.price.unit_amount ? (item.price.unit_amount / 100).toString() : null,
            metadata: {},
          })
        )
      );
    }

    // Audit log
    const dbPrice = await subscriptionRepository.findPriceByName(tx, planName);
    await subscriptionRepository.createEvent(tx, {
      subscription_id: subscriptionId,
      plan_id: dbPrice?.id,
      event_type: eventType === 'created' ? 'created' : 'status_changed',
      to_status: 'active',
      triggered_by_type: trigger,
      metadata: { plan_name: planName, stripe_subscription_id: stripeSubscription.id },
    });
    subscriptionSynced = true;
  });

  // Cancel stale Stripe subscriptions after the transaction commits — keeps
  // lock duration short and avoids partial rollback leaving Stripe inconsistent.
  for (const stripeId of stripeIdsToCancel) {
    try {
      await getStripeInstance().subscriptions.cancel(stripeId);
    } catch (err) {
      logger.error('Failed to cancel stale subscription in Stripe after commit: {stripeId} - {error}', {
        stripeId,
        error: err,
      });
    }
  }

  if (cancelIncomingAndStop) return;

  // Idempotent SubscriptionCreated dispatch
  if (subscriptionSynced && !hadCreatedEvent) {
    await SubscriptionCreated.dispatch(
      {
        subscription_id: subscriptionId,
        stripe_subscription_id: stripeSubscription.id,
        plan_name: planName,
        organization_id: organizationId!,
      },
      { actorId: 'system', organizationId: organizationId!, critical: true }
    );
  }
};

// ---------------------------------------------------------------------------
// attachMeteredPricesToSubscription
// ---------------------------------------------------------------------------

export const attachMeteredPricesToSubscription = async (stripeSubscription: Stripe.Subscription): Promise<void> => {
  const stripe = getStripeInstance();
  const liveSub = await stripe.subscriptions.retrieve(stripeSubscription.id);
  const existingPriceIds = new Set(liveSub.items.data.map((i) => i.price.id));

  const productIds = Array.from(
    new Set(
      liveSub.items.data
        .map((i) =>
          typeof i.price.product === 'string' ? i.price.product : (i.price.product as { id: string } | null)?.id
        )
        .filter(Boolean)
    )
  ) as string[];

  if (productIds.length === 0) return;

  const meteredPrices = await db
    .select({ stripe_price_id: stripePrices.stripe_price_id })
    .from(stripePrices)
    .where(
      and(
        eq(stripePrices.usage_type, 'metered'),
        eq(stripePrices.is_active, true),
        inArray(stripePrices.stripe_product_id, productIds)
      )
    );

  const toAdd = meteredPrices
    .map((p) => p.stripe_price_id)
    .filter((id) => !existingPriceIds.has(id))
    .sort();

  if (toAdd.length === 0) return;

  const idempotencyKey = `attach-metered-${stripeSubscription.id}-${toAdd.join(',')}`;
  await stripe.subscriptions.update(
    stripeSubscription.id,
    { items: toAdd.map((price) => ({ price })), proration_behavior: 'none' },
    { idempotencyKey }
  );

  logger.info('Attached {count} metered price(s) to subscription {id}', {
    count: toAdd.length,
    id: stripeSubscription.id,
  });
};

// ---------------------------------------------------------------------------
// Helpers for resolving local subscription from Stripe webhook events
// ---------------------------------------------------------------------------

const resolveLocalSubscription = async (stripeSubscription: Stripe.Subscription) => {
  // Prefer metadata set by our checkout service
  const metaId = stripeSubscription.metadata?.subscription_id;
  if (metaId) {
    const [sub] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, metaId)).limit(1);
    if (sub) return sub;
  }

  // Fall back: look up by Stripe subscription ID
  const [sub] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.stripeSubscriptionId, stripeSubscription.id))
    .limit(1);
  return sub ?? null;
};

// ---------------------------------------------------------------------------
// handleSubscriptionEvent — called by webhook worker for customer.subscription.*
// and checkout.session.completed
// ---------------------------------------------------------------------------

export const handleSubscriptionEvent = async (event: Stripe.Event): Promise<void> => {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription') return;

      const stripeSubscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      if (!stripeSubscriptionId) {
        logger.warn('checkout.session.completed has no subscription ID, skipping');
        return;
      }

      const stripe = getStripeInstance();
      const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      const localSub = await resolveLocalSubscription(stripeSub);

      if (!localSub) {
        logger.warn('No local subscription found for checkout.session.completed {stripeSubId}', {
          stripeSubId: stripeSubscriptionId,
        });
        return;
      }

      await syncSubscriptionToOrg(db, {
        stripeSubscription: stripeSub,
        subscriptionId: localSub.id,
        referenceId: localSub.referenceId,
        stripeCustomerId: localSub.stripeCustomerId,
        planName: localSub.plan,
        eventType: 'created',
        trigger: 'user',
      });
      await attachMeteredPricesToSubscription(stripeSub);
      break;
    }

    case 'customer.subscription.created': {
      const stripeSub = event.data.object as Stripe.Subscription;
      const localSub = await resolveLocalSubscription(stripeSub);

      if (!localSub) {
        logger.warn('No local subscription found for customer.subscription.created {stripeSubId}', {
          stripeSubId: stripeSub.id,
        });
        return;
      }

      await syncSubscriptionToOrg(db, {
        stripeSubscription: stripeSub,
        subscriptionId: localSub.id,
        referenceId: localSub.referenceId,
        stripeCustomerId: localSub.stripeCustomerId,
        planName: localSub.plan,
        eventType: 'created',
        trigger: 'webhook',
      });
      await attachMeteredPricesToSubscription(stripeSub);
      break;
    }

    case 'customer.subscription.updated': {
      const stripeSub = event.data.object as Stripe.Subscription;
      const localSub = await resolveLocalSubscription(stripeSub);
      if (!localSub) {
        logger.warn('No local subscription found for customer.subscription.updated {stripeSubId}', {
          stripeSubId: stripeSub.id,
        });
        return;
      }

      await db.transaction(async (tx) => {
        if (localSub.referenceId) {
          const isEntitled = (PRACTICE_ENTITLED_STATUSES as readonly string[]).includes(stripeSub.status);
          if (isEntitled) {
            // Only claim pointer if not already owned by a different subscription
            await tx
              .update(schema.organizations)
              .set({ activeSubscriptionId: localSub.id })
              .where(
                and(
                  eq(schema.organizations.id, localSub.referenceId),
                  or(
                    isNull(schema.organizations.activeSubscriptionId),
                    eq(schema.organizations.activeSubscriptionId, localSub.id)
                  )
                )
              );
          } else {
            // Only clear pointer if it still points to this subscription
            await tx
              .update(schema.organizations)
              .set({ activeSubscriptionId: null })
              .where(
                and(
                  eq(schema.organizations.id, localSub.referenceId),
                  eq(schema.organizations.activeSubscriptionId, localSub.id)
                )
              );
          }
        }

        // Update subscription row
        await tx
          .update(schema.subscriptions)
          .set({
            status: stripeSub.status,
            periodStart: stripeSub.items.data[0]?.current_period_start
              ? fromStripeTimestamp(stripeSub.items.data[0].current_period_start)
              : null,
            periodEnd: stripeSub.items.data[0]?.current_period_end
              ? fromStripeTimestamp(stripeSub.items.data[0].current_period_end)
              : null,
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
            cancelAt: stripeSub.cancel_at ? fromStripeTimestamp(stripeSub.cancel_at) : null,
            updatedAt: new Date(),
          })
          .where(eq(schema.subscriptions.id, localSub.id));

        // Sync line items
        if (stripeSub.items?.data) {
          await Promise.all(
            stripeSub.items.data.map((item) =>
              subscriptionRepository.upsertLineItem(tx, {
                subscription_id: localSub.id,
                stripe_subscription_item_id: item.id,
                stripe_price_id: item.price.id,
                item_type: 'base_fee',
                description: item.price.nickname ?? item.price.product?.toString(),
                quantity: item.quantity ?? 1,
                unit_amount: item.price.unit_amount ? (item.price.unit_amount / 100).toString() : null,
                metadata: {},
              })
            )
          );
        }

        const oldDbPrice = await subscriptionRepository.findPriceByName(tx, localSub.plan);
        const licensedItem = stripeSub.items.data.find(
          (item) => item.price.recurring && item.price.recurring.usage_type !== 'metered'
        );
        const newDbPrice = licensedItem
          ? await subscriptionRepository.findPriceByStripeId(tx, licensedItem.price.id)
          : null;
        if (newDbPrice?.id !== oldDbPrice?.id) {
          await subscriptionRepository.createEvent(tx, {
            subscription_id: localSub.id,
            plan_id: oldDbPrice?.id,
            to_plan_id: newDbPrice?.id ?? oldDbPrice?.id,
            event_type: 'plan_changed',
            triggered_by_type: 'webhook',
            metadata: { from_plan_name: localSub.plan, to_plan_name: newDbPrice?.name ?? localSub.plan },
          });
        }
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object as Stripe.Subscription;
      const localSub = await resolveLocalSubscription(stripeSub);
      if (!localSub) {
        logger.warn('No local subscription found for customer.subscription.deleted {stripeSubId}', {
          stripeSubId: stripeSub.id,
        });
        return;
      }

      await db.transaction(async (tx) => {
        if (localSub.referenceId) {
          await tx
            .update(schema.organizations)
            .set({ activeSubscriptionId: null })
            .where(eq(schema.organizations.id, localSub.referenceId));
        }

        await tx
          .update(schema.subscriptions)
          .set({ status: 'canceled', updatedAt: new Date() })
          .where(eq(schema.subscriptions.id, localSub.id));

        await subscriptionRepository.createEvent(tx, {
          subscription_id: localSub.id,
          event_type: 'canceled',
          from_status: localSub.status,
          to_status: 'canceled',
          triggered_by_type: 'webhook',
          metadata: { plan_name: localSub.plan },
        });
      });
      break;
    }

    case 'customer.subscription.paused':
    case 'customer.subscription.trial_will_end': {
      const stripeSub = event.data.object as Stripe.Subscription;
      const localSub = await resolveLocalSubscription(stripeSub);
      if (!localSub) return;

      await subscriptionRepository.createEvent(db, {
        subscription_id: localSub.id,
        event_type: 'status_changed',
        to_status: event.type === 'customer.subscription.paused' ? 'paused' : localSub.status,
        triggered_by_type: 'webhook',
        metadata: { stripe_event_type: event.type },
      });
      break;
    }

    default:
      logger.warn('Unhandled subscription event type: {type}', { type: event.type });
  }
};
