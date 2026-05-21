/**
 * Subscription Relations
 *
 * Separated to avoid circular dependencies between subscription_plans and subscription_prices
 */

import { relations } from 'drizzle-orm';
import { subscriptionPlans } from '@/modules/subscriptions/database/schema/subscriptionPlans.schema';
import { subscriptionPrices } from '@/modules/subscriptions/database/schema/subscriptionPrices.schema';
import { subscriptionEvents } from '@/modules/subscriptions/database/schema/subscriptionEvents.schema';

export const subscriptionPlansRelations = relations(subscriptionPlans, ({ many }) => ({
  prices: many(subscriptionPrices),
  events: many(subscriptionEvents),
}));

export const subscriptionPricesRelations = relations(subscriptionPrices, ({ one }) => ({
  plan: one(subscriptionPlans, {
    fields: [subscriptionPrices.plan_id],
    references: [subscriptionPlans.id],
  }),
}));
