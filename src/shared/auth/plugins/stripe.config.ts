import { stripe as stripePlugin } from '@better-auth/stripe';
import { eq, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type Stripe from 'stripe';
import * as schema from '@/schema';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { getStripeInstance } from '@/shared/utils/stripe-client';
import { fetchStripePlans } from './fetchStripePlans';
import { upsertLineItem } from '@/modules/subscriptions/database/queries/subscriptionLineItems.repository';
import { createEvent } from '@/modules/subscriptions/database/queries/subscriptionEvents.repository';
import { findPlanByStripePriceId } from '@/modules/subscriptions/database/queries/subscriptionPlans.repository';
import {
  existsByStripeEventId,
  createWebhookEvent,
} from '@/shared/repositories/stripe.webhook-events.repository';
import { addWebhookJob } from '@/shared/queue/queue.manager';

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
  }
) => {
  const { stripeSubscription, subscriptionId, referenceId, stripeCustomerId, planName, eventType, trigger } = params;

  // 1. Resolve Customer ID
  const customerId = stripeCustomerId
    || (typeof stripeSubscription.customer === 'string' ? stripeSubscription.customer : null);

  if (!customerId) {
    console.warn('[Stripe Plugin] No customer ID found, skipping sync.');
    return;
  }

  // 2. Resolve Organization ID (Priority: ReferenceId -> Lookup by CustomerId)
  let organizationId = referenceId;

  if (!organizationId) {
    const org = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.stripeCustomerId, customerId))
      .limit(1);

    organizationId = org[0]?.id || null;
  }

  if (!organizationId) {
    console.warn(`[Stripe Plugin] No organization found for Customer ID: ${customerId}`);
    return;
  }

  console.log(`[Stripe Plugin] Syncing subscription ${subscriptionId} to Org ${organizationId}`);

  // 3. TRANSACTION: Update Org, Line Items, and Logs atomically
  await db.transaction(async (tx) => {
    // A. Update Organization Active Subscription
    await tx
      .update(schema.organizations)
      .set({
        stripeCustomerId: customerId,
        activeSubscriptionId: subscriptionId,
      })
      .where(eq(schema.organizations.id, organizationId!));

    // B. Sync Line Items (Parallelized)
    if (stripeSubscription.items?.data) {
      // Use Promise.all for concurrency instead of sequential for-loop
      await Promise.all(
        stripeSubscription.items.data.map((item) =>
          upsertLineItem(tx, {
            subscriptionId: subscriptionId,
            stripeSubscriptionItemId: item.id,
            stripePriceId: item.price.id,
            itemType: 'base_fee',
            description: item.price.nickname || item.price.product?.toString(),
            quantity: item.quantity || 1,
            unitAmount: item.price.unit_amount ? (item.price.unit_amount / 100).toString() : null,
            metadata: {},
          })
        )
      );
    }

    // C. Create Audit Log
    const dbPlan = await findPlanByStripePriceId(tx, planName);

    await createEvent(tx, {
      subscriptionId: subscriptionId,
      planId: dbPlan?.id,
      eventType: eventType === 'created' ? 'created' : 'status_changed',
      toStatus: 'active',
      triggeredByType: trigger,
      metadata: {
        plan_name: planName,
        stripe_subscription_id: stripeSubscription.id,
      },
    });
  });

  // 4. Side Effects (Fire-and-forget, outside transaction)
  // We don't want event publishing failure to rollback the DB transaction
  publishSimpleEvent(
    EventType.SUBSCRIPTION_CREATED,
    'system',
    organizationId,
    {
      subscription_id: subscriptionId,
      stripe_subscription_id: stripeSubscription.id,
      plan_name: planName,
      organization_id: organizationId,
    }
  ).catch(err => console.error('Failed to publish subscription event:', err));
};

/**
 * Main Plugin Configuration
 */
export const createStripePlugin = (db: NodePgDatabase<typeof schema>): ReturnType<typeof stripePlugin> => {
  return stripePlugin({
    stripeClient: getStripeInstance(),
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    createCustomerOnSignUp: false,

    // Opt: Save customer ID immediately
    onCustomerCreate: async ({ stripeCustomer, user }) => {
      // When customer is created for an organization (via referenceId in subscription),
      // the organization_id is stored in Stripe customer metadata
      const organizationId = stripeCustomer.metadata?.organization_id;

      if (organizationId && stripeCustomer.id) {
        await db.update(schema.organizations)
          .set({ stripeCustomerId: stripeCustomer.id })
          .where(eq(schema.organizations.id, organizationId));
      }
    },

    // Opt: Centralized Webhook Handling
    onEvent: async (event) => {
      try {
        if (await existsByStripeEventId(event.id)) {
          console.log(`⚠️ Skipped duplicate event: ${event.id}`);
          return;
        }

        const webhookEvent = await createWebhookEvent(
          event,
          { 'stripe-event-id': event.id, 'stripe-event-type': event.type },
          '/api/auth/stripe/webhook'
        );

        // Define which events need custom background processing
        const CUSTOM_PROCESS_PREFIXES = ['product.', 'price.', 'account.', 'capability.', 'payment_intent.'];
        const needsProcessing = CUSTOM_PROCESS_PREFIXES.some(prefix => event.type.startsWith(prefix));

        if (needsProcessing) {
          addWebhookJob(webhookEvent.id, event.id, event.type).catch(console.error);
        }
      } catch (error) {
        console.error(`❌ Webhook Error ${event.id}:`, error);
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
            eq(schema.members.organizationId, referenceId)
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
          trigger: 'user'
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
        stripeSubscription,
      }: {
        event: unknown;
        subscription: {
          id: string;
          referenceId: string | null;
          plan?: string;
        };
        stripeSubscription?: Stripe.Subscription;
      }) => {
        if (!subscription.referenceId) return;

        await db.transaction(async (tx) => {
          // Update active subscription pointer
          await tx.update(schema.organizations)
            .set({ activeSubscriptionId: subscription.id })
            .where(eq(schema.organizations.id, subscription.referenceId!));

          // Update line items if available
          if (stripeSubscription?.items?.data) {
            await Promise.all(stripeSubscription.items.data.map(item =>
              upsertLineItem(tx, {
                subscriptionId: subscription.id,
                stripeSubscriptionItemId: item.id,
                stripePriceId: item.price.id,
                itemType: 'base_fee',
                description: item.price.nickname || item.price.product?.toString(),
                quantity: item.quantity || 1,
                unitAmount: item.price.unit_amount ? (item.price.unit_amount / 100).toString() : null,
                metadata: {},
              })
            ));
          }

          // Log event
          if (subscription.plan) {
            const dbPlan = await findPlanByStripePriceId(tx, subscription.plan);
            await createEvent(tx, {
              subscriptionId: subscription.id,
              planId: dbPlan?.id,
              toPlanId: dbPlan?.id,
              eventType: 'plan_changed',
              triggeredByType: 'webhook', // usually webhook for updates
              metadata: { plan_name: subscription.plan },
            });
          }
        });
      },

      onSubscriptionCancel: async ({ subscription }) => {
        if (!subscription.referenceId) return;

        await db.transaction(async (tx) => {
          await tx.update(schema.organizations)
            .set({ activeSubscriptionId: null })
            .where(eq(schema.organizations.id, subscription.referenceId!));

          await createEvent(tx, {
            subscriptionId: subscription.id,
            eventType: 'canceled',
            fromStatus: 'active',
            toStatus: 'canceled',
            triggeredByType: 'user',
            metadata: { plan_name: subscription.plan || '' },
          });
        });
      },
    },
  });
};
