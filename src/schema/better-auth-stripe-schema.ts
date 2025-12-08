/**
 * Better Auth Stripe Plugin Schema
 *
 * Schema for Better Auth Stripe plugin subscription table
 * This table is managed by Better Auth Stripe plugin
 */

import { pgTable, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';

/**
 * Subscriptions table for Better Auth Stripe plugin
 * This table stores subscription data managed by Better Auth
 */
export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  plan: text('plan').notNull(),
  referenceId: text('reference_id'), // Organization ID or User ID
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  status: text('status').default('incomplete').notNull(),
  periodStart: timestamp('period_start'),
  periodEnd: timestamp('period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  seats: integer('seats'),
  trialStart: timestamp('trial_start'),
  trialEnd: timestamp('trial_end'),
});


