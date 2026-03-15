import { relations } from 'drizzle-orm';
import { subscriptionEvents } from '@/modules/subscriptions/database/schema/subscriptionEvents.schema';
import { subscriptionLineItems } from '@/modules/subscriptions/database/schema/subscriptionLineItems.schema';
import { subscriptions, organizations } from '@/schema/better-auth-schema';

export const subscriptionsRelations = relations(subscriptions, ({ many, one }) => ({
  events: many(subscriptionEvents),
  lineItems: many(subscriptionLineItems),
  organization: one(organizations, {
    fields: [subscriptions.referenceId],
    references: [organizations.id],
    relationName: 'orgSubscriptions',
  }),
  activeForOrganization: one(organizations, {
    fields: [subscriptions.id],
    references: [organizations.activeSubscriptionId],
    relationName: 'activeSubscription',
  }),
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
