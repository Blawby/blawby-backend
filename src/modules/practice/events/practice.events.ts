/**
 * Practice Event Handlers
 *
 * Registers handlers for practice-related events.
 * Since organizations = practices in our domain model, these handlers
 * process events for both organization and practice operations.
 */

import { EventType } from '@/shared/events/enums/event-types';
import { subscribeToEvent } from '@/shared/events/event-consumer';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import { addEmailJob } from '@/shared/queue/queue.manager';
import { EMAIL_TEMPLATES } from '@/shared/services/email';
import { logError } from '@/shared/utils/logging';
import { type PaymentEventPayload, isPaymentPayload } from './practice.events.types';

const APP_URL = process.env.APP_URL || 'https://app.blawby.com';

/**
 * Register all practice event handlers
 */
export const registerPracticeEvents = (): void => {
  console.info('Registering practice event handlers...');

  // Practice created - organization/practice created
  subscribeToEvent(EventType.PRACTICE_CREATED, async (event: BaseEvent) => {
    console.info('Practice created', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
    // Future: Send welcome email, analytics tracking, etc.
  });

  // Practice updated - organization/practice updated
  subscribeToEvent(EventType.PRACTICE_UPDATED, async (event: BaseEvent) => {
    console.info('Practice updated', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
    // Future: Analytics tracking, cache invalidation, etc.
  });

  // Practice deleted - organization/practice deleted
  subscribeToEvent(EventType.PRACTICE_DELETED, async (event: BaseEvent) => {
    console.info('Practice deleted', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
    // Future: Cleanup tasks, analytics tracking, etc.
  });

  // Practice details created
  subscribeToEvent(EventType.PRACTICE_DETAILS_CREATED, async (event: BaseEvent) => {
    console.info('Practice details created', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
  });

  // Practice details updated
  subscribeToEvent(EventType.PRACTICE_DETAILS_UPDATED, async (event: BaseEvent) => {
    console.info('Practice details updated', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
  });

  // Practice details deleted
  subscribeToEvent(EventType.PRACTICE_DETAILS_DELETED, async (event: BaseEvent) => {
    console.info('Practice details deleted', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
  });

  // Practice switched - active practice/organization switched
  subscribeToEvent(EventType.PRACTICE_SWITCHED, async (event: BaseEvent) => {
    console.info('Practice switched', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
    // Future: Update session, analytics tracking, etc.
  });

  /**
   * Billing & Payment Emails
   */

  // Payment Succeeded - Send receipts to Customer and Team
  subscribeToEvent(EventType.PAYMENT_SUCCEEDED, async (event: BaseEvent) => {
    if (!isPaymentPayload(event.payload)) {
      logError('Invalid PAYMENT_SUCCEEDED payload', new Error('Payload validation failed'), {
        eventId: event.eventId,
        payload: event.payload
      });
      return;
    }

    const { customer, payment, items, business } = event.payload;

    // 1. Send Customer Receipt (fire and forget)
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
        eventId: event.eventId,
        invoiceNumber: payment.invoiceNumber,
        recipientEmail: customer.email
      });
    });

    // 2. Send Team Notification (fire and forget)
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
          eventId: event.eventId,
          invoiceNumber: payment.invoiceNumber,
          businessId: event.organizationId
        });
      });
    }
  });

  // Payment Refunded - Send confirmation to Customer
  subscribeToEvent(EventType.PAYMENT_REFUNDED, async (event: BaseEvent) => {
    if (!isPaymentPayload(event.payload)) {
      logError('Invalid PAYMENT_REFUNDED payload', new Error('Payload validation failed'), {
        eventId: event.eventId,
        payload: event.payload
      });
      return;
    }

    const { customer, payment, items, business } = event.payload;

    // Send Refund Confirmation (fire and forget)
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
        eventId: event.eventId,
        invoiceNumber: payment.invoiceNumber
      });
    });
  });

  console.info('✅ Practice event handlers registered');
};
