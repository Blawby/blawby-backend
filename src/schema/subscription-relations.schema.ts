import { relations } from 'drizzle-orm';
import { subscriptionEvents } from '@/modules/subscriptions/database/schema/subscriptionEvents.schema';
import { subscriptionLineItems } from '@/modules/subscriptions/database/schema/subscriptionLineItems.schema';
import { subscriptions } from '@/schema/better-auth-schema';

export const subscriptionsRelations = relations(subscriptions, ({ many }) => ({
  events: many(subscriptionEvents),
  lineItems: many(subscriptionLineItems),
}));

export const subscriptionEventsSubscriptionRelation = relations(subscriptionEvents, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [subscriptionEvents.subscription_id],
    references: [subscriptions.id],
  }),
}));

export const subscriptionLineItemsSubscriptionRelation = relations(subscriptionLineItems, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [subscriptionLineItems.subscription_id],
    references: [subscriptions.id],
  }),
}));
