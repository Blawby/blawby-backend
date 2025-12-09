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

/**
 * Authorize subscription reference (organization) access
 * Only owners and admins can manage subscriptions
 */
const createAuthorizeReference = (
  db: NodePgDatabase<typeof schema>,
) => async ({ user, referenceId }: {
  user: { id: string };
  referenceId: string | null | undefined
}): Promise<boolean> => {
    if (!referenceId) {
      // If no referenceId provided, authorization fails
      // The subscription service should handle org creation before calling Better Auth
      return false;
    }

    // Validate authorization
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
    return userRole === 'owner' || userRole === 'admin';
  };

/**
 * Handle subscription completion - save customer ID to organizations table
 * Also creates line items and logs event
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
    if (subscription.referenceId) {
      // Get customer ID from subscription or Stripe subscription object
      const customerId = subscription.stripeCustomerId
        || (typeof stripeSubscription.customer === 'string' ? stripeSubscription.customer : null);

      if (customerId) {
        // Update organization with customer ID and subscription ID
        await db
          .update(schema.organizations)
          .set({
            stripeCustomerId: customerId,
            activeSubscriptionId: subscription.id,
          })
          .where(eq(schema.organizations.id, subscription.referenceId));
      }

      // Find plan in database
      const dbPlan = await findPlanByStripePriceId(db, plan.name);

      // Create line items from Stripe subscription items
      if (stripeSubscription.items?.data) {
        for (const item of stripeSubscription.items.data) {
          await upsertLineItem(db, {
            subscriptionId: subscription.id,
            stripeSubscriptionItemId: item.id,
            stripePriceId: item.price.id,
            itemType: 'base_fee', // Default, can be enhanced with metadata
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
          stripe_subscription_id: subscription.stripeSubscriptionId || '',
        },
      });

      void publishSimpleEvent(
        'stripe.subscription.created' as EventType,
        'system',
        subscription.referenceId,
        {
          subscription_id: subscription.id,
          stripe_subscription_id: subscription.stripeSubscriptionId || '',
          plan_name: plan.name,
          organization_id: subscription.referenceId,
        },
      );
    }
  };

/**
 * Handle subscription updates
 * Updates line items if plan changed and logs event
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
 * Logs cancellation event (preserves line items for historical records)
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
 * Create Stripe plugin configuration
 */
export const createStripePlugin = (db: NodePgDatabase<typeof schema>): ReturnType<typeof stripePlugin> => {
  return stripePlugin({
    stripeClient: getStripeInstance(),
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    createCustomerOnSignUp: false, // Don't create customer on user signup - create per organization
    onCustomerCreate: createOnCustomerCreate(db), // Save customer ID immediately when created
    subscription: {
      enabled: true,
      plans: fetchStripePlans, // Dynamically fetch plans from Stripe
      authorizeReference: createAuthorizeReference(db),
      onSubscriptionComplete: createOnSubscriptionComplete(db),
      onSubscriptionUpdate: createOnSubscriptionUpdate(db),
      onSubscriptionCancel: createOnSubscriptionCancel(db),
    },
  });
};

