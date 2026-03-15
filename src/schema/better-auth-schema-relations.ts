// Define relations
import { relations } from 'drizzle-orm/relations';
import {
  users,
  sessions,
  members,
  invitations,
  accounts,
  organizations,
  subscriptions,
} from '@/schema/better-auth-schema';
import { stripeConnectedAccounts } from '@/modules/onboarding/schemas/onboarding.schema';

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  members: many(members),
  invitations: many(invitations),
}));

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  members: many(members),
  invitations: many(invitations),
  stripeConnectedAccounts: many(stripeConnectedAccounts),
  subscriptions: many(subscriptions, { relationName: 'orgSubscriptions' }),
  activeSubscription: one(subscriptions, {
    fields: [organizations.activeSubscriptionId],
    references: [subscriptions.id],
    relationName: 'activeSubscription',
  }),
}));

export const betterAuthSubscriptionsRelations = relations(subscriptions, ({ one }) => ({
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

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const membersRelations = relations(members, ({ one }) => ({
  user: one(users, {
    fields: [members.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [members.organizationId],
    references: [organizations.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [invitations.organizationId],
    references: [organizations.id],
  }),
  inviter: one(users, {
    fields: [invitations.inviterId],
    references: [users.id],
  }),
}));
