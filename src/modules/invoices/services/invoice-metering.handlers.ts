/**
 * Invoice Metering Handlers
 *
 * Handles invoice.upcoming and invoice.created events for seat-based billing sync.
 * Uses the "Absolute Total" strategy: reports current member count to Stripe Metering API.
 */

import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { eq } from 'drizzle-orm';
import { seatMeteringService } from '@/modules/subscriptions/services/seat-metering.service';
import { organizations } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';

const logger = getLogger(['invoices', 'metering-handlers']);

/**
 * Handle invoice.upcoming event
 *
 * Part of the "Absolute Total" seat-based billing sync strategy.
 * Reports the current member count to Stripe Metering API.
 *
 * Note: invoice.upcoming is a preview event and doesn't create an invoice
 * in our database. We only report the seat count.
 */
export const handleInvoiceUpcoming = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  try {
    // Extract organization ID from customer metadata
    // The customer ID is stored in stripeInvoice.customer
    const customerId = typeof stripeInvoice.customer === 'string' ? stripeInvoice.customer : stripeInvoice.customer?.id;

    if (!customerId) {
      logger.warn('invoice.upcoming event missing customer ID: {invoiceId}', {
        invoiceId: stripeInvoice.id,
      });
      return;
    }

    // Find organization by Stripe Customer ID
    const [org] = await db
      .select({
        id: organizations.id,
        stripeCustomerId: organizations.stripeCustomerId,
      })
      .from(organizations)
      .where(eq(organizations.stripeCustomerId, customerId))
      .limit(1);

    if (!org) {
      logger.warn('Organization not found for Stripe Customer ID: {customerId} (invoice: {invoiceId})', {
        customerId,
        invoiceId: stripeInvoice.id,
      });
      return;
    }

    // Report current seat count to Stripe Metering (stateless, absolute total)
    const meteringSynced = await seatMeteringService.syncSeatCountOnInvoice(db, stripeInvoice, org.id, customerId);

    logger.info(
      meteringSynced
        ? '✅ Processed invoice.upcoming event: {invoiceId} for organization {organizationId}'
        : '⚠️ Processed invoice.upcoming event: {invoiceId} for organization {organizationId} (metering sync failed)',
      {
        invoiceId: stripeInvoice.id,
        organizationId: org.id,
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to handle invoice.upcoming webhook: {error}', { error: message });
    throw new Error('Failed to handle invoice.upcoming webhook', { cause: error });
  }
};

/**
 * Handle invoice.created event
 *
 * Part of the "Absolute Total" seat-based billing sync strategy.
 * Reports the current member count to Stripe Metering API.
 *
 * This is the second webhook in our redundant JIT sync strategy,
 * providing a failsafe if invoice.upcoming was missed.
 */
export const handleInvoiceCreated = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  try {
    // Extract organization ID from customer metadata
    const customerId = typeof stripeInvoice.customer === 'string' ? stripeInvoice.customer : stripeInvoice.customer?.id;

    if (!customerId) {
      logger.warn('invoice.created event missing customer ID: {invoiceId}', {
        invoiceId: stripeInvoice.id,
      });
      return;
    }

    // Find organization by Stripe Customer ID
    const [org] = await db
      .select({
        id: organizations.id,
        stripeCustomerId: organizations.stripeCustomerId,
      })
      .from(organizations)
      .where(eq(organizations.stripeCustomerId, customerId))
      .limit(1);

    if (!org) {
      logger.warn('Organization not found for Stripe Customer ID: {customerId} (invoice: {invoiceId})', {
        customerId,
        invoiceId: stripeInvoice.id,
      });
      return;
    }

    // Report current seat count to Stripe Metering (stateless, absolute total)
    const meteringSynced = await seatMeteringService.syncSeatCountOnInvoice(db, stripeInvoice, org.id, customerId);

    logger.info(
      meteringSynced
        ? '✅ Processed invoice.created event: {invoiceId} for organization {organizationId}'
        : '⚠️ Processed invoice.created event: {invoiceId} for organization {organizationId} (metering sync failed)',
      {
        invoiceId: stripeInvoice.id,
        organizationId: org.id,
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to handle invoice.created webhook: {error}', { error: message });
    throw new Error('Failed to handle invoice.created webhook', { cause: error });
  }
};
