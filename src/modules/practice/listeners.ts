/**
 * Practice Module Event Listeners
 *
 * Handles practice/organization-related events including
 * CRUD operations and payment notifications.
 */

import { getLogger } from '@logtape/logtape';
import {
  PracticeCreated,
  PracticeUpdated,
  PracticeDeleted,
  PracticeDetailsCreated,
  PracticeDetailsUpdated,
  PracticeDetailsDeleted,
  PracticeSwitched,
  PaymentSucceeded,
  PaymentRefunded,
} from '@/shared/events/definitions';
import { Event } from '@/shared/events/event';
import { addEmailJob } from '@/shared/queue/queue.manager';
import { EMAIL_TEMPLATES } from '@/shared/services/email';
import { logError } from '@/shared/utils/logging';

const logger = getLogger(['practice', 'listeners']);
const APP_URL = process.env.APP_URL || 'https://app.blawby.com';

// Type guard for payment payloads
interface PaymentPayload {
  customer: { email: string; name: string };
  payment: {
    id: string;
    invoiceNumber: string;
    amount: number;
    method: string;
    amountRefunded?: number;
  };
  items: Array<{ description: string; amount: number }>;
  business: {
    name: string;
    logoUrl?: string;
    ownerEmail?: string;
    ownerName?: string;
    supportEmail?: string;
  };
}

function isPaymentPayload(payload: unknown): payload is PaymentPayload {
  return (
    typeof payload === 'object'
    && payload !== null
    && 'customer' in payload
    && 'payment' in payload
    && 'items' in payload
    && 'business' in payload
  );
}

/**
 * Register all practice event listeners
 */
export function registerPracticeListeners(): void {
  logger.info('Registering practice event listeners...');

  // Practice created
  Event.listen(PracticeCreated, async (payload) => {
    logger.info('Practice created', { organizationId: payload.organization_id });
    // Future: Send welcome email, analytics tracking, etc.
  });

  // Practice updated
  Event.listen(PracticeUpdated, async () => {
    logger.info('Practice updated');
    // Future: Analytics tracking, cache invalidation, etc.
  });

  // Practice deleted
  Event.listen(PracticeDeleted, async () => {
    logger.info('Practice deleted');
    // Future: Cleanup tasks, analytics tracking, etc.
  });

  // Practice details created
  Event.listen(PracticeDetailsCreated, async () => {
    logger.info('Practice details created');
  });

  // Practice details updated
  Event.listen(PracticeDetailsUpdated, async () => {
    logger.info('Practice details updated');
  });

  // Practice details deleted
  Event.listen(PracticeDetailsDeleted, async () => {
    logger.info('Practice details deleted');
  });

  // Practice switched
  Event.listen(PracticeSwitched, async (payload) => {
    logger.info('Practice switched', {
      userId: payload.user_id,
      toOrganizationId: payload.to_organization_id,
    });
    // Future: Update session, analytics tracking, etc.
  });

  // Payment succeeded - send receipts
  Event.listen(PaymentSucceeded, async (payload) => {
    if (!isPaymentPayload(payload)) {
      logError('Invalid PAYMENT_SUCCEEDED payload', new Error('Payload validation failed'), {
        payload,
      });
      return;
    }

    const {
      customer, payment, items, business,
    } = payload;

    // 1. Send Customer Receipt
    void addEmailJob(
      EMAIL_TEMPLATES.CUSTOMER_PAYMENT_RECEIPT,
      customer.email,
      `Payment receipt from ${business.name}`,
      {
        recipientEmail: customer.email,
        recipientName: customer.name,
        businessName: business.name,
        teamPhotoUrl: business.logoUrl,
        invoiceNumber: payment.invoiceNumber,
        amountPaid: payment.amount,
        amountDue: payment.amount,
        paidAt: new Date().toLocaleDateString(),
        lineItems: items,
        paymentMethod: payment.method,
        supportEmail: business.supportEmail,
      },
    ).catch((error) => {
      logError('Failed to queue customer receipt email', error, {
        invoiceNumber: payment.invoiceNumber,
        recipientEmail: customer.email,
      });
    });

    // 2. Send Team Notification
    if (business.ownerEmail) {
      void addEmailJob(
        EMAIL_TEMPLATES.TEAM_PAYMENT_RECEIPT,
        business.ownerEmail,
        `New payment received: ${payment.invoiceNumber}`,
        {
          recipientEmail: business.ownerEmail,
          recipientName: business.ownerName,
          businessName: business.name,
          invoiceNumber: payment.invoiceNumber,
          amountPaid: payment.amount,
          lineItems: items,
          paymentMethod: payment.method,
          invoiceUrl: `${APP_URL}/dashboard/invoices/${payment.id}`,
          supportEmail: 'support@blawby.com',
        },
      ).catch((error) => {
        logError('Failed to queue team receipt email', error, {
          invoiceNumber: payment.invoiceNumber,
        });
      });
    }
  });

  // Payment refunded - send confirmation
  Event.listen(PaymentRefunded, async (payload) => {
    if (!isPaymentPayload(payload)) {
      logError('Invalid PAYMENT_REFUNDED payload', new Error('Payload validation failed'), {
        payload,
      });
      return;
    }

    const {
      customer, payment, items, business,
    } = payload;

    void addEmailJob(
      EMAIL_TEMPLATES.CUSTOMER_REFUND_COMPLETED,
      customer.email,
      `Refund confirmation from ${business.name}`,
      {
        recipientEmail: customer.email,
        recipientName: customer.name,
        businessName: business.name,
        invoiceNumber: payment.invoiceNumber,
        amountRefunded: payment.amountRefunded || 0,
        lineItems: items,
        supportEmail: business.supportEmail,
      },
    ).catch((error) => {
      logError('Failed to queue refund confirmation email', error, {
        invoiceNumber: payment.invoiceNumber,
      });
    });
  });

  logger.info('Practice event listeners registered');
}
