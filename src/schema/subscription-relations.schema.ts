import { relations } from 'drizzle-orm';
import { subscriptionEvents } from '@/modules/subscriptions/database/schema/subscription-events.schema';
import { subscriptionLineItems } from '@/modules/subscriptions/database/schema/subscription-line-items.schema';
import { organizations } from '@/schema/better-auth-schema';
import { subscriptions } from '@/modules/subscriptions/database/schema/subscriptions.schema';

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
