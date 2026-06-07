import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import type { Stripe } from 'stripe';
import { seatMeteringService } from '@/modules/subscriptions/services/seat-metering.service';
import { organizations } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';

const logger = getLogger(['invoices', 'delivery-webhook-service']);

const syncSeatCountForInvoice = async (
  stripeInvoice: Stripe.Invoice,
  eventType: 'invoice.upcoming' | 'invoice.created'
): Promise<void> => {
  const customerId = typeof stripeInvoice.customer === 'string' ? stripeInvoice.customer : stripeInvoice.customer?.id;

  if (!customerId) {
    logger.warn('{eventType} event missing customer ID: {invoiceId}', {
      eventType,
      invoiceId: stripeInvoice.id,
    });
    return;
  }

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

  const meteringSynced = await seatMeteringService.syncSeatCountOnInvoice(stripeInvoice, org.id, customerId);

  const meteringNote = meteringSynced ? '' : ' (metering sync failed)';
  const message = `Processed {eventType} event: {invoiceId} for organization {organizationId}${meteringNote}`;
  const logContext = {
    eventType,
    invoiceId: stripeInvoice.id,
    organizationId: org.id,
  };

  if (meteringSynced) {
    logger.info(message, logContext);
    return;
  }

  logger.warn(message, logContext);
};

export const handleInvoiceUpcoming = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  await syncSeatCountForInvoice(stripeInvoice, 'invoice.upcoming');
};

export const handleInvoiceCreated = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  await syncSeatCountForInvoice(stripeInvoice, 'invoice.created');
};
