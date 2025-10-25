import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import type { SelectPaymentLink } from '../database/schema/payment-links.schema';

import { organizations } from '@/schema';
import { db } from '@/shared/database';

export const sendPaymentLinkReceipts = async function sendPaymentLinkReceipts(
  paymentLink: SelectPaymentLink,
  charge: Stripe.Charge,
): Promise<void> {
  try {
    // Get organization details
    const organization = await db.query.organizations.findFirst({
      where: eq(organizations.id, paymentLink.organizationId),
    });

    if (!organization) {
      console.error('Organization not found for payment link', {
        paymentLinkId: paymentLink.id,
      });
      return;
    }

    const customerEmail = (paymentLink.metadata as Record<string, unknown>)?.email as string;
    const customerName = (paymentLink.metadata as Record<string, unknown>)?.name as string;

    if (!customerEmail) {
      console.warn('No customer email for payment link', {
        paymentLinkId: paymentLink.id,
      });
      return;
    }

    // Format amounts
    const amountDollars = (paymentLink.amount / 100).toFixed(2);
    const applicationFeeDollars = paymentLink.applicationFee
      ? (paymentLink.applicationFee / 100).toFixed(2)
      : '0.00';

    // Customer receipt
    const _customerReceiptData = {
      to: customerEmail,
      subject: `Payment Receipt - ${organization.name}`,
      template: 'payment-link-customer-receipt',
      data: {
        organizationName: organization.name,
        organizationLogo: organization.logo,
        customerName: customerName || 'Customer',
        amount: amountDollars,
        currency: paymentLink.currency.toUpperCase(),
        receiptId: paymentLink.ulid,
        paymentDate: new Date().toLocaleDateString(),
        onBehalfOf: (paymentLink.metadata as Record<string, unknown>)?.on_behalf_of as string,
      },
    };

    // Organization receipt
    const _organizationReceiptData = {
      to: organization.billingEmail || organization.stripeCustomerId, // Fallback to Stripe customer
      subject: `Payment Received - ${customerName || 'Customer'}`,
      template: 'payment-link-organization-receipt',
      data: {
        organizationName: organization.name,
        customerName: customerName || 'Customer',
        customerEmail,
        amount: amountDollars,
        applicationFee: applicationFeeDollars,
        netAmount: (
          (paymentLink.amount - (paymentLink.applicationFee || 0))
          / 100
        ).toFixed(2),
        currency: paymentLink.currency.toUpperCase(),
        receiptId: paymentLink.ulid,
        paymentDate: new Date().toLocaleDateString(),
        onBehalfOf: (paymentLink.metadata as Record<string, unknown>)?.on_behalf_of as string,
        stripeChargeId: charge.id,
      },
    };

    // Send emails (implement your email service here)
    // await emailService.send(_customerReceiptData);
    // await emailService.send(_organizationReceiptData);

    console.info(
      {
        paymentLinkId: paymentLink.id,
        customerEmail,
        organizationId: organization.id,
      },
      'Payment link receipts sent',
    );
  } catch (error) {
    console.error(
      {
        error,
        paymentLinkId: paymentLink.id,
      },
      'Failed to send payment link receipts',
    );
  }
};
