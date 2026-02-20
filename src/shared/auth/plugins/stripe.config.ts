import { stripe as stripePlugin } from '@better-auth/stripe';
import { getLogger } from '@logtape/logtape';
import { eq, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Stripe } from 'stripe';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import * as schema from '@/schema';
import { fetchStripePlans } from '@/shared/auth/plugins/fetchStripePlans';
import { SubscriptionCreated } from '@/shared/events/definitions';
import { addWebhookJob } from '@/shared/queue/queue.manager';
import {
  createWebhookEventIfNotExists,
} from '@/shared/repositories/stripe.webhook-events.repository';
import { appConfigService } from '@/shared/services/app-config.service';
import { getStripeInstance } from '@/shared/utils/stripe-client';

const logger = getLogger(['shared', 'auth', 'plugins', 'stripe']);

/**
 * SHARED HELPER: Synchronize subscription state to local DB.
 * Used by both webhook (created) and checkout (complete) events.
 */
const syncSubscriptionToOrg = async (
  db: NodePgDatabase<typeof schema>,
  params: {
    stripeSubscription: Stripe.Subscription;
    subscriptionId: string; // The local DB ID from Better Auth
    referenceId: string | null;
    stripeCustomerId?: string | null;
    planName: string;
    eventType: 'created' | 'active' | 'updated';
    trigger: 'webhook' | 'user';
  },
): Promise<void> => {
  const {
    stripeSubscription,
    subscriptionId,
    referenceId,
    stripeCustomerId,
    planName,
    eventType,
    trigger,
  } = params;


  // 1. Resolve Customer ID
  const customerId = stripeCustomerId
    || (typeof stripeSubscription.customer === 'string' ? stripeSubscription.customer : null);

  if (!customerId) {
    logger.warn('[Stripe Plugin] No customer ID found for subscription {subscriptionId}, skipping sync.', { subscriptionId });
    return;
  }

  // 2. Resolve Organization ID (Priority: ReferenceId -> Lookup by CustomerId)
  let organizationId = referenceId;

  if (!organizationId) {
    logger.debug('[Stripe Plugin] No ReferenceId provided, looking up Org by customerId: {customerId}', { customerId });
    const org = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.stripeCustomerId, customerId))
      .limit(1);

    organizationId = org[0]?.id || null;
  }

  if (!organizationId) {
    logger.warn('[Stripe Plugin] No organization found for ReferenceId: {referenceId} or Customer ID: {customerId}', {
      referenceId,
      customerId,
    });
    return;
  }


  // 3. TRANSACTION: Update Org, Line Items, and Logs atomically
  await db.transaction(async (tx) => {
    // Check for existing active subscription (Race Condition Handling)
    const [existingOrg] = await tx
      .select({ activeSubscriptionId: schema.organizations.activeSubscriptionId })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId!))
      .limit(1);

    if (existingOrg?.activeSubscriptionId && existingOrg.activeSubscriptionId !== subscriptionId) {
      const [oldSub] = await tx
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, existingOrg.activeSubscriptionId))
        .limit(1);

      if (oldSub) {
        // Compare creation timestamps
        // Incoming: stripeSubscription.created (Unix timestamp)
        // Existing: oldSub.createdAt (Date object)
        const incomingCreated = new Date(stripeSubscription.created * 1000);
        const existingCreated = oldSub.createdAt;

        if (incomingCreated < existingCreated) {
          logger.warn('[Stripe Plugin] ⚠️ Race Condition: Incoming subscription {incomingId} is OLDER than active subscription {existingId}. Canceling incoming.', {
            incomingId: subscriptionId,
            existingId: oldSub.id,
            incomingCreated,
            existingCreated,
          });

          // Cancel the incoming stale subscription in Stripe
          try {
            const stripeClient = getStripeInstance();
            await stripeClient.subscriptions.cancel(stripeSubscription.id);
            logger.info('[Stripe Plugin] Canceled stale incoming subscription {stripeId} in Stripe.', { stripeId: stripeSubscription.id });
          } catch (err) {
            logger.error('[Stripe Plugin] Failed to cancel stale incoming subscription in Stripe: {error}', { error: err });
          }

          // Mark as canceled in DB
          await tx
            .update(schema.subscriptions)
            .set({ status: 'canceled', updatedAt: new Date() })
            .where(eq(schema.subscriptions.id, subscriptionId));

          // ABORT sync to prevent overwriting the valid active subscription
          return;
        } else {
          logger.warn('[Stripe Plugin] ⚠️ Race Condition: Incoming subscription {incomingId} is NEWER than active subscription {existingId}. Canceling existing.', {
            incomingId: subscriptionId,
            existingId: oldSub.id,
            incomingCreated,
            existingCreated,
          });

          // Cancel the existing (now stale) subscription in Stripe
          if (oldSub.stripeSubscriptionId) {
            try {
              const stripeClient = getStripeInstance();
              await stripeClient.subscriptions.cancel(oldSub.stripeSubscriptionId);
              logger.info('[Stripe Plugin] Canceled stale existing subscription {stripeId} in Stripe.', { stripeId: oldSub.stripeSubscriptionId });
            } catch (err) {
              logger.error('[Stripe Plugin] Failed to cancel stale existing subscription in Stripe: {error}', { error: err });
            }
          }

          // Mark existing as canceled in DB
          await tx
            .update(schema.subscriptions)
            .set({ status: 'canceled', updatedAt: new Date() })
            .where(eq(schema.subscriptions.id, oldSub.id));

          // Proceed to update organization with new subscription
        }
      }
    }

    // A. Update Organization Active Subscription
    const updated = await tx
      .update(schema.organizations)
      .set({
        stripeCustomerId: customerId,
        activeSubscriptionId: subscriptionId,
      })
      .where(eq(schema.organizations.id, organizationId!))
      .returning({ id: schema.organizations.id });

    if (updated.length === 0) {
      logger.error('[Stripe Plugin] CRITICAL: Failed to update organization table for {organizationId}. Row not found.', {
        organizationId,
        subscriptionId,
        customerId,
      });
      throw new Error('Failed to update organization table during sync - organization not found');
    }

    logger.debug('[Stripe Plugin] Successfully updated organizations.activeSubscriptionId for {organizationId}', {
      organizationId,
      subscriptionId,
    });


    // B. Sync Line Items (Parallelized)
    if (stripeSubscription.items?.data) {
      // Use Promise.all for concurrency instead of sequential for-loop
      await Promise.all(
        stripeSubscription.items.data.map((item) => subscriptionRepository.upsertLineItem(tx, {
          subscription_id: subscriptionId,
          stripe_subscription_item_id: item.id,
          stripe_price_id: item.price.id,
          item_type: 'base_fee',
          description: item.price.nickname || item.price.product?.toString(),
          quantity: item.quantity || 1,
          unit_amount: item.price.unit_amount ? (item.price.unit_amount / 100).toString() : null,
          metadata: {},
        })),
      );
    }

    // C. Create Audit Log
    const dbPlan = await subscriptionRepository.findPlanByName(tx, planName);

    await subscriptionRepository.createEvent(tx, {
      subscription_id: subscriptionId,
      plan_id: dbPlan?.id,
      event_type: eventType === 'created' ? 'created' : 'status_changed',
      to_status: 'active',
      triggered_by_type: trigger,
      metadata: {
        plan_name: planName,
        stripe_subscription_id: stripeSubscription.id,
      },
    });
  });

  // 4. Metered items are now handled by proxy interception at checkout/portal creation.
  // No longer needed: ensureSubscriptionMeteredItems.

  // 5. Idempotency Check before dispatching
  const existingEvents = await subscriptionRepository.findEventsBySubscriptionIdAndType(
    db, subscriptionId, 'created',
  );

  if (existingEvents.length === 0) {
    // Use critical: true for immediate DB write with NOTIFY
    await SubscriptionCreated.dispatch({
      subscription_id: subscriptionId,
      stripe_subscription_id: stripeSubscription.id,
      plan_name: planName,
      organization_id: organizationId,
    }, {
      actorId: 'system',
      organizationId,
      critical: true,
    });
  }
};

/**
 * Main Plugin Configuration
 */
export const createStripePlugin = (db: NodePgDatabase<typeof schema>): ReturnType<typeof stripePlugin> => {
  return stripePlugin({
    stripeClient: createProxiedStripeClient(getStripeInstance()),
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    createCustomerOnSignUp: false,

    // Opt: Save customer ID immediately and enrich with metadata
    onCustomerCreate: async ({ stripeCustomer }) => {
      // When customer is created for an organization (via referenceId in subscription),
      // the organization_id is stored in Stripe customer metadata
      const organizationId = stripeCustomer.metadata?.organization_id;

      if (organizationId && stripeCustomer.id) {
        // 1. Link to organization locally
        await db.update(schema.organizations)
          .set({ stripeCustomerId: stripeCustomer.id })
          .where(eq(schema.organizations.id, organizationId));

        // 2. Enrich Stripe customer with platform-specific metadata
        // Better Auth creates the customer, but we add late-binding custom fields
        const stripe = getStripeInstance();
        try {
          await stripe.customers.update(stripeCustomer.id, {
            metadata: {
              iolta_compliant: 'true',
              type: 'platform_billing',
            },
          });
          logger.info('[Stripe Plugin] Enriched new organization customer {customerId} with custom metadata.', { customerId: stripeCustomer.id });
        } catch (err) {
          logger.error('[Stripe Plugin] Failed to enrich organization customer {customerId}: {error}', {
            customerId: stripeCustomer.id,
            error: err,
          });
        }
      }
    },

    // Opt: Centralized Webhook Handling
    onEvent: async (event) => {
      try {
        const webhookEvent = await createWebhookEventIfNotExists(
          event,
          { 'stripe-event-id': event.id, 'stripe-event-type': event.type },
          '/api/auth/stripe/webhook',
        );

        if (!webhookEvent) {
          logger.info('⚠️ Skipped duplicate event: {eventId}', { eventId: event.id });
          return;
        }

        const CUSTOM_PROCESS_PREFIXES = ['product.', 'price.', 'account.', 'capability.', 'payment_intent.', 'charge.', 'invoice.'];
        const needsProcessing = CUSTOM_PROCESS_PREFIXES.some((prefix) => event.type.startsWith(prefix));

        if (needsProcessing) {
          try {
            await addWebhookJob(webhookEvent.id, event.id, event.type);
          } catch (err) {
            logger.error('Failed to add webhook job: {error}', { error: err });
          }
        }
      } catch (error) {
        logger.error('❌ Webhook Error {eventId}: {error}', {
          eventId: event.id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Do not throw; prevent Stripe from retrying infinitely on logic errors
      }
    },

    subscription: {
      enabled: true,
      plans: fetchStripePlans,

      authorizeReference: async ({ user, referenceId, action }) => {
        // If listing without ID, allow it (returns empty array anyway)
        if (!referenceId) return action === 'list-subscription';

        const member = await db
          .select({ role: schema.members.role })
          .from(schema.members)
          .where(and(
            eq(schema.members.userId, user.id),
            eq(schema.members.organizationId, referenceId),
          ))
          .limit(1);

        if (!member.length) return false;
        if (action === 'list-subscription') return true;
        return ['owner', 'admin'].includes(member[0].role || '');
      },

      // Use unified handler for both checkout completion and webhook creation
      onSubscriptionComplete: async ({
        subscription,
        plan,
        stripeSubscription,
      }: {
        event: unknown;
        subscription: {
          id: string;
          referenceId: string | null;
          stripeCustomerId?: string | null;
        };
        plan: { name: string };
        stripeSubscription: Stripe.Subscription;
      }) => {
        await syncSubscriptionToOrg(db, {
          stripeSubscription,
          subscriptionId: subscription.id,
          referenceId: subscription.referenceId,
          stripeCustomerId: subscription.stripeCustomerId,
          planName: plan.name,
          eventType: 'created',
          trigger: 'user',
        });
      },

      onSubscriptionCreated: async ({
        subscription,
        plan,
        stripeSubscription,
      }: {
        event: unknown;
        subscription: {
          id: string;
          referenceId: string | null;
          stripeCustomerId?: string | null;
        };
        plan: { name: string };
        stripeSubscription: Stripe.Subscription;
      }) => {
        await syncSubscriptionToOrg(db, {
          stripeSubscription,
          subscriptionId: subscription.id,
          referenceId: subscription.referenceId,
          stripeCustomerId: subscription.stripeCustomerId,
          planName: plan.name,
          eventType: 'created',
          trigger: 'webhook',
        });
      },

      onSubscriptionUpdate: async ({
        subscription,
      }: {
        event: unknown;
        subscription: {
          id: string;
          referenceId: string | null;
          plan?: string;
          stripeSubscriptionId?: string;
        };
        stripeSubscription?: Stripe.Subscription;
      }) => {
        if (!subscription.referenceId) return;

        await db.transaction(async (tx) => {
          // Update active subscription pointer
          await tx.update(schema.organizations)
            .set({ activeSubscriptionId: subscription.id })
            .where(eq(schema.organizations.id, subscription.referenceId!));

          // Fetch Stripe subscription for line item sync (Better Auth does not pass it here)
          let stripeSub: Stripe.Subscription | null = null;
          if (subscription.stripeSubscriptionId) {
            try {
              const stripe = getStripeInstance();
              stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
            } catch (err) {
              logger.warn('[Stripe Plugin] Failed to fetch Stripe subscription for line item sync', {
                subscriptionId: subscription.id,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }

          // Sync line items if available
          if (stripeSub?.items?.data) {
            await Promise.all(stripeSub.items.data.map((item) => subscriptionRepository.upsertLineItem(tx, {
              subscription_id: subscription.id,
              stripe_subscription_item_id: item.id,
              stripe_price_id: item.price.id,
              item_type: 'base_fee',
              description: item.price.nickname || item.price.product?.toString(),
              quantity: item.quantity || 1,
              unit_amount: item.price.unit_amount ? (item.price.unit_amount / 100).toString() : null,
              metadata: {},
            })));
          }

          // Log event
          if (subscription.plan) {
            const dbPlan = await subscriptionRepository.findPlanByName(tx, subscription.plan);
            await subscriptionRepository.createEvent(tx, {
              subscription_id: subscription.id,
              plan_id: dbPlan?.id,
              to_plan_id: dbPlan?.id,
              event_type: 'plan_changed',
              triggered_by_type: 'webhook', // usually webhook for updates
              metadata: { plan_name: subscription.plan },
            });
          }
        });
      },

      onSubscriptionCancel: async ({ subscription }) => {
        if (!subscription.referenceId) return;

        // Do NOT null activeSubscriptionId — subscription is still active until period end.
        await subscriptionRepository.createEvent(db, {
          subscription_id: subscription.id,
          event_type: 'status_changed',
          from_status: 'active',
          to_status: 'active',
          triggered_by_type: 'user',
          metadata: { plan_name: subscription.plan || '', cancel_requested: true },
        });
      },

      onSubscriptionDeleted: async ({ subscription }) => {
        if (!subscription.referenceId) return;

        await db.transaction(async (tx) => {
          // Now we clear the active subscription pointer
          await tx.update(schema.organizations)
            .set({ activeSubscriptionId: null })
            .where(eq(schema.organizations.id, subscription.referenceId!));

          await subscriptionRepository.createEvent(tx, {
            subscription_id: subscription.id,
            event_type: 'canceled',
            from_status: 'active',
            to_status: 'canceled',
            triggered_by_type: 'webhook',
            metadata: { plan_name: subscription.plan || '' },
          });
        });
      },
    },
  });
};

/**
 * Type guards for Stripe Params
 */
const isCheckoutSessionCreateParams = (params: unknown): params is Stripe.Checkout.SessionCreateParams => {
  return typeof params === 'object' && params !== null && 'line_items' in params;
};

const isBillingPortalSessionCreateParams = (params: unknown): params is Stripe.BillingPortal.SessionCreateParams => {
  return typeof params === 'object' && params !== null && 'flow_data' in params;
};

/**
 * Creates a proxied Stripe client that recursively wraps the SDK
 * and intercepts session creation to inject metered items.
 */
const createProxiedStripeClient = (stripe: Stripe): Stripe => {
  const wrap = (obj: Record<string, unknown>, path: string): unknown => {
    return new Proxy(obj, {
      get(target, prop, receiver) {
        const val = Reflect.get(target, prop, receiver);
        if (val === null || val === undefined) return val;

        const propName = String(prop);
        const currentPath = path ? `${path}.${propName}` : propName;

        if (typeof val === 'function') {
          const needsInterception
            = currentPath === 'checkout.sessions.create'
            || currentPath === 'billingPortal.sessions.create';

          if (needsInterception) {
            return async (...args: unknown[]) => {
              const currentArgs = [...args];
              try {
                if (currentPath === 'checkout.sessions.create') {
                  const params = currentArgs[0];
                  if (isCheckoutSessionCreateParams(params)) {
                    const injected = await injectMeteredItems(params.line_items);
                    if (injected !== undefined) {
                      params.line_items = injected;
                    }
                  }
                } else if (currentPath === 'billingPortal.sessions.create') {
                  const params = currentArgs[0];
                  if (
                    isBillingPortalSessionCreateParams(params)
                    && params.flow_data?.type === 'subscription_update_confirm'
                    && params.flow_data.subscription_update_confirm
                  ) {
                    const injected = await injectMeteredItems(
                      params.flow_data.subscription_update_confirm.items,
                    );
                    if (injected !== undefined) {
                      params.flow_data.subscription_update_confirm.items = injected as
                        Stripe.BillingPortal.SessionCreateParams.FlowData.SubscriptionUpdateConfirm.Item[];
                    }
                  }
                }
              } catch (injectError) {
                logger.error('[Stripe Proxy] Failed to inject metered items: {error}', {
                  path: currentPath,
                  error: injectError instanceof Error ? injectError.message : String(injectError),
                });
                // Continue with original args if injection fails to avoid blocking the user
              }
              return Reflect.apply(val, target, currentArgs);
            };
          }
          return val.bind(target);
        }

        if (typeof val === 'object' && !Array.isArray(val)) {
          return wrap(val as Record<string, unknown>, currentPath);
        }

        return val;
      },
    });
  };
  return wrap(stripe as unknown as Record<string, unknown>, '') as Stripe;
};

/**
 * Injects metered price IDs from app_config into a list of Stripe items.
 * returns a new array with metered items injected.
 */
const injectMeteredItems = async <T extends { price?: string }>(
  items: T[] | undefined,
): Promise<(T | { price: string })[] | undefined> => {
  const meteredIds = await appConfigService.get<string[]>('metered_price_ids') ?? [];
  if (meteredIds.length === 0) return undefined;

  const existingPrices = new Set(items?.map((item) => item.price).filter(Boolean) ?? []);

  const newEntries = meteredIds
    .filter((id) => !existingPrices.has(id))
    .map((id) => ({ price: id }));

  if (newEntries.length === 0) return undefined;

  const addedCount = newEntries.length;
  logger.info('[Stripe Proxy] Bundled {count} metered prices into session', { count: addedCount });

  return [...(items ?? []), ...newEntries];
};
