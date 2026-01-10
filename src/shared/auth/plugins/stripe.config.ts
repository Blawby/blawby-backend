/**
 * Stripe Plugin Configuration
 *
 * Configures the Better Auth Stripe plugin for organization-level subscriptions
 */

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
 * Authorize subscription reference (organization) access
 * - list-subscription: Any member can view subscriptions
 * - upgrade/cancel/restore: Only owners and admins can manage
 *
 * Note: For organization-based subscriptions, the API requires:
 * - referenceId query parameter (organization ID)
 * - customerType query parameter set to "organization"
 * Without these, Better Auth defaults to user-based subscriptions and returns empty array.
 */
const createAuthorizeReference = (
  db: NodePgDatabase<typeof schema>,
) => async ({ user, session, referenceId, action }: {
  user: { id: string };
  session?: unknown;
  referenceId: string | null | undefined;
  action?: string;
}): Promise<boolean> => {
    // For list-subscription without referenceId, allow authorization
    // Better Auth will return empty array because our subscriptions are organization-based
    // User should provide referenceId query parameter to get organization subscriptions
    if (!referenceId) {
      if (action === 'list-subscription') {
        // Allow authorization - Better Auth will handle empty result
        // User needs to provide referenceId query parameter to get subscriptions
        return true;
      }
      // For other actions, require referenceId
      return false;
    }

    // Validate authorization - check if user is a member of the organization
    const member = await db
      .select({
        role: schema.members.role,
      })
      .from(schema.members)
      .where(
        and(
          eq(schema.members.userId, user.id),
          eq(schema.members.organizationId, referenceId),
        ),
      )
      .limit(1);

    if (member.length === 0) {
      return false; // User is not a member of this organization
    }

    const userRole = member[0].role;

    // For list-subscription, any member can view
    if (action === 'list-subscription') {
      return true;
    }

    // For upgrade/cancel/restore, only owners and admins
    return userRole === 'owner' || userRole === 'admin';
  };

/**
 * Handle subscription created via webhook (outside checkout flow)
 * Called when Better Auth receives customer.subscription.created webhook
 *
 * Better Auth automatically syncs subscription status, stripe_subscription_id, and period dates.
 * We only handle organization updates, line items, and event logging.
 */
const createOnSubscriptionCreated = (
  db: NodePgDatabase<typeof schema>,
) => async ({
  subscription,
  plan,
  stripeSubscription,
}: {
  event: unknown;
  stripeSubscription: Stripe.Subscription;
  subscription: {
    id: string;
    referenceId: string | null;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string | null;
  };
  plan: { name: string };
}): Promise<void> => {
    console.log('[Stripe Plugin] onSubscriptionCreated called (webhook):', {
      subscriptionId: subscription.id,
      referenceId: subscription.referenceId,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: stripeSubscription.id,
      stripeStatus: stripeSubscription.status,
      plan: plan.name,
    });

    // Better Auth automatically syncs subscription status and stripe_subscription_id
    // We only need to update the organization and create line items

    const customerId = subscription.stripeCustomerId
      || (typeof stripeSubscription.customer === 'string' ? stripeSubscription.customer : null);

    if (!customerId) {
      console.warn('[Stripe Plugin] No customer ID found in subscription');
      return;
    }

    let organizationId = subscription.referenceId;

    // If no referenceId, try to find organization by customer ID
    if (!organizationId) {
      console.log('[Stripe Plugin] No referenceId, looking up organization by customer ID:', customerId);
      const org = await db
        .select({ id: schema.organizations.id })
        .from(schema.organizations)
        .where(eq(schema.organizations.stripeCustomerId, customerId))
        .limit(1);

      if (org.length > 0) {
        organizationId = org[0].id;
        console.log('[Stripe Plugin] Found organization by customer ID:', organizationId);
      } else {
        console.warn('[Stripe Plugin] No organization found for customer ID:', customerId);
        return;
      }
    }

    if (organizationId) {
      // Update organization with customer ID and subscription ID
      // Better Auth doesn't update organizations table automatically
      await db
        .update(schema.organizations)
        .set({
          stripeCustomerId: customerId,
          activeSubscriptionId: subscription.id,
        })
        .where(eq(schema.organizations.id, organizationId));

      console.log('[Stripe Plugin] Updated organization:', organizationId, 'with subscription:', subscription.id);

      // Find plan in database
      const dbPlan = await findPlanByStripePriceId(db, plan.name);

      // Create line items from Stripe subscription items
      if (stripeSubscription.items?.data) {
        for (const item of stripeSubscription.items.data) {
          await upsertLineItem(db, {
            subscriptionId: subscription.id,
            stripeSubscriptionItemId: item.id,
            stripePriceId: item.price.id,
            itemType: 'base_fee',
            description: item.price.nickname || item.price.product?.toString(),
            quantity: item.quantity || 1,
            unitAmount: item.price.unit_amount
              ? (item.price.unit_amount / 100).toString()
              : null,
            metadata: {},
          });
        }
      }

      // Log subscription created event
      void createEvent(db, {
        subscriptionId: subscription.id,
        planId: dbPlan?.id,
        eventType: 'created',
        toStatus: 'active',
        triggeredByType: 'webhook',
        metadata: {
          plan_name: plan.name,
          stripe_subscription_id: subscription.stripeSubscriptionId || stripeSubscription.id,
        },
      });

      void publishSimpleEvent(
        'stripe.subscription.created' as EventType,
        'system',
        organizationId,
        {
          subscription_id: subscription.id,
          stripe_subscription_id: subscription.stripeSubscriptionId || stripeSubscription.id,
          plan_name: plan.name,
          organization_id: organizationId,
        },
      );
    }
  };

/**
 * Handle subscription completion - called after checkout flow completes
 *
 * Better Auth automatically syncs subscription status, stripe_subscription_id, and period dates.
 * We only handle organization updates, line items, and event logging.
 */
const createOnSubscriptionComplete = (
  db: NodePgDatabase<typeof schema>,
) => async ({
  subscription,
  plan,
  stripeSubscription,
}: {
  event: unknown;
  stripeSubscription: Stripe.Subscription;
  subscription: {
    id: string;
    referenceId: string | null;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string | null;
  };
  plan: { name: string };
}): Promise<void> => {
    console.log('[Stripe Plugin] onSubscriptionComplete called:', {
      subscriptionId: subscription.id,
      referenceId: subscription.referenceId,
      stripeCustomerId: subscription.stripeCustomerId,
      plan: plan.name,
    });

    // Better Auth automatically syncs subscription status and stripe_subscription_id
    // We only need to update the organization and create line items

    const customerId = subscription.stripeCustomerId
      || (typeof stripeSubscription.customer === 'string' ? stripeSubscription.customer : null);

    if (!customerId) {
      console.warn('[Stripe Plugin] No customer ID found in subscription');
      return;
    }

    let organizationId = subscription.referenceId;

    // If no referenceId, try to find organization by customer ID
    if (!organizationId) {
      console.log('[Stripe Plugin] No referenceId, looking up organization by customer ID:', customerId);
      const org = await db
        .select({ id: schema.organizations.id })
        .from(schema.organizations)
        .where(eq(schema.organizations.stripeCustomerId, customerId))
        .limit(1);

      if (org.length > 0) {
        organizationId = org[0].id;
        console.log('[Stripe Plugin] Found organization by customer ID:', organizationId);
      } else {
        console.warn('[Stripe Plugin] No organization found for customer ID:', customerId);
        return;
      }
    }

    if (organizationId) {
      // Update organization with customer ID and subscription ID
      // Better Auth doesn't update organizations table automatically
      await db
        .update(schema.organizations)
        .set({
          stripeCustomerId: customerId,
          activeSubscriptionId: subscription.id,
        })
        .where(eq(schema.organizations.id, organizationId));

      console.log('[Stripe Plugin] Updated organization:', organizationId, 'with subscription:', subscription.id);

      // Find plan in database
      const dbPlan = await findPlanByStripePriceId(db, plan.name);

      // Create line items from Stripe subscription items
      if (stripeSubscription.items?.data) {
        for (const item of stripeSubscription.items.data) {
          await upsertLineItem(db, {
            subscriptionId: subscription.id,
            stripeSubscriptionItemId: item.id,
            stripePriceId: item.price.id,
            itemType: 'base_fee',
            description: item.price.nickname || item.price.product?.toString(),
            quantity: item.quantity || 1,
            unitAmount: item.price.unit_amount
              ? (item.price.unit_amount / 100).toString()
              : null,
            metadata: {},
          });
        }
      }

      // Log subscription created event
      void createEvent(db, {
        subscriptionId: subscription.id,
        planId: dbPlan?.id,
        eventType: 'created',
        toStatus: 'active',
        triggeredByType: 'user',
        metadata: {
          plan_name: plan.name,
          stripe_subscription_id: subscription.stripeSubscriptionId || stripeSubscription.id,
        },
      });

      void publishSimpleEvent(
        'stripe.subscription.created' as EventType,
        'system',
        organizationId,
        {
          subscription_id: subscription.id,
          stripe_subscription_id: subscription.stripeSubscriptionId || stripeSubscription.id,
          plan_name: plan.name,
          organization_id: organizationId,
        },
      );
    }
  };

/**
 * Handle subscription updates
 *
 * Better Auth automatically syncs subscription status and period dates.
 * We only handle organization updates, line items, and event logging.
 */
const createOnSubscriptionUpdate = (
  db: NodePgDatabase<typeof schema>,
) => async ({
  subscription,
  stripeSubscription,
}: {
  subscription: {
    id: string;
    referenceId: string | null;
    plan?: string;
  };
  stripeSubscription?: Stripe.Subscription;
}): Promise<void> => {
    if (subscription.referenceId) {
      // Update organization's active subscription
      // Better Auth doesn't update organizations table automatically
      await db
        .update(schema.organizations)
        .set({
          activeSubscriptionId: subscription.id,
        })
        .where(eq(schema.organizations.id, subscription.referenceId));

      // Update line items if subscription items changed
      if (stripeSubscription?.items?.data) {
        for (const item of stripeSubscription.items.data) {
          await upsertLineItem(db, {
            subscriptionId: subscription.id,
            stripeSubscriptionItemId: item.id,
            stripePriceId: item.price.id,
            itemType: 'base_fee',
            description: item.price.nickname || item.price.product?.toString(),
            quantity: item.quantity || 1,
            unitAmount: item.price.unit_amount
              ? (item.price.unit_amount / 100).toString()
              : null,
            metadata: {},
          });
        }
      }

      // Log subscription update event
      if (subscription.plan) {
        const dbPlan = await findPlanByStripePriceId(db, subscription.plan);
        await createEvent(db, {
          subscriptionId: subscription.id,
          planId: dbPlan?.id,
          toPlanId: dbPlan?.id,
          eventType: 'plan_changed',
          triggeredByType: 'user',
          metadata: {
            plan_name: subscription.plan,
          },
        });
      } else {
        await createEvent(db, {
          subscriptionId: subscription.id,
          eventType: 'status_changed',
          triggeredByType: 'webhook',
          metadata: {},
        });
      }
    }
  };

/**
 * Handle subscription cancellation
 *
 * Better Auth automatically syncs subscription status to 'canceled'.
 * We only handle organization updates and event logging.
 */
const createOnSubscriptionCancel = (
  db: NodePgDatabase<typeof schema>,
) => async ({
  subscription,
}: {
  subscription: {
    id: string;
    referenceId: string | null;
    plan?: string;
  };
}): Promise<void> => {
    if (subscription.referenceId) {
      // Clear organization's active subscription
      // Better Auth doesn't update organizations table automatically
      await db
        .update(schema.organizations)
        .set({
          activeSubscriptionId: null,
        })
        .where(eq(schema.organizations.id, subscription.referenceId));

      // Log cancellation event
      await createEvent(db, {
        subscriptionId: subscription.id,
        eventType: 'canceled',
        fromStatus: 'active',
        toStatus: 'canceled',
        triggeredByType: 'user',
        metadata: {
          plan_name: subscription.plan || '',
        },
      });
    }
  };

/**
 * Handle customer creation - save customer ID to organization immediately
 * This runs when a Stripe customer is created during subscription checkout
 */
const createOnCustomerCreate = (
  db: NodePgDatabase<typeof schema>,
) => async ({
  stripeCustomer,
  referenceId,
  user: _user,
}: {
  stripeCustomer: Stripe.Customer;
  user: { id: string };
  referenceId?: string | null;
}): Promise<void> => {
    // If customer was created for an organization, save it immediately
    if (referenceId && stripeCustomer.id) {
      await db
        .update(schema.organizations)
        .set({
          stripeCustomerId: stripeCustomer.id,
        })
        .where(eq(schema.organizations.id, referenceId));
    }
  };

/**
 * Handle webhook events - save to database and queue for custom processing
 *
 * Better Auth automatically handles:
 * - customer.subscription.* events (via onSubscriptionComplete, onSubscriptionUpdate, onSubscriptionCancel)
 * - checkout.session.completed
 *
 * We only queue events that need custom processing:
 * - product.*, price.* (subscription plan management)
 * - account.*, capability.* (onboarding)
 * - payment_intent.* (payments)
 * - Other custom events
 */
const createOnEvent = (
  db: NodePgDatabase<typeof schema>,
) => async (event: Stripe.Event): Promise<void> => {
  try {
    // Check idempotency - if event already exists, skip saving
    const existingEvent = await existsByStripeEventId(event.id);
    if (existingEvent) {
      console.log(`⚠️  Webhook event already exists: ${event.id} (${event.type})`);
      return;
    }

    // Explicit debug logging for Connect events (User Request)
    if (event.account) {
      console.log(`🔌 [Connect Event] Received ${event.type} for connected account: ${event.account}`);
    } else if (event.type.startsWith('account.') || event.type.startsWith('capability.')) {
      console.log(`🔌 [Connect Event] Received ${event.type} (no account ID)`);
    }

    // Save webhook to database (for audit/logging purposes)
    // Note: Better Auth doesn't provide headers/URL in onEvent callback,
    // so we use minimal metadata
    const webhookEvent = await createWebhookEvent(
      event,
      {
        'stripe-event-id': event.id,
        'stripe-event-type': event.type,
      },
      '/api/auth/stripe/webhook',
    );

    console.log(`💾 Webhook saved to database: ${event.id} (${event.type}) - ID: ${webhookEvent.id}`);

    // Only queue events that need custom processing
    // Better Auth handles customer.subscription.* events automatically
    const needsCustomProcessing =
      event.type.startsWith('product.') ||
      event.type.startsWith('price.') ||
      event.type.startsWith('account.') ||
      event.type.startsWith('capability.') ||
      event.type.startsWith('account.external_account.') ||
      event.type.startsWith('payment_intent.') ||
      event.type.startsWith('charge.');

    if (needsCustomProcessing) {
      // Queue job to Graphile Worker (fire-and-forget)
      addWebhookJob(webhookEvent.id, event.id, event.type).catch((error) => {
        console.error(
          `❌ Failed to queue webhook job ${event.id}:`,
          error,
        );
      });
    } else {
      // Better Auth handles this event type automatically
      // Mark as processed since Better Auth will handle it
      console.log(`✅ Webhook handled by Better Auth: ${event.id} (${event.type})`);
      // Note: Better Auth's callbacks will handle the business logic
      // We just save it for audit purposes
    }
  } catch (error) {
    console.error(
      `❌ Error handling webhook event ${event.id}:`,
      error,
    );
    // Don't throw - let Better Auth continue processing
  }
};

/**
 * Create Stripe plugin configuration
 */
export const createStripePlugin = (db: NodePgDatabase<typeof schema>): ReturnType<typeof stripePlugin> => {
  return stripePlugin({
    stripeClient: getStripeInstance(),
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    createCustomerOnSignUp: false, // Don't create customer on user signup - create per organization
    onCustomerCreate: createOnCustomerCreate(db), // Save customer ID immediately when created
    onEvent: createOnEvent(db), // Intercept all webhook events to save and queue
    subscription: {
      enabled: true,
      plans: fetchStripePlans, // Dynamically fetch plans from Stripe
      authorizeReference: createAuthorizeReference(db),
      onSubscriptionComplete: createOnSubscriptionComplete(db), // Called after checkout
      onSubscriptionCreated: createOnSubscriptionCreated(db), // Called for webhook events
      onSubscriptionUpdate: createOnSubscriptionUpdate(db),
      onSubscriptionCancel: createOnSubscriptionCancel(db),
    },
  });
};

