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
  IntakePaymentSucceeded,
} from '@/shared/events/definitions';
import { config } from '@/shared/config';
import { Event } from '@/shared/events/event';
import { queueManager } from '@/shared/queue/queue.manager';
import { EMAIL_TEMPLATES } from '@/shared/services/email';
import { logError, hashEmail } from '@/shared/utils/logging';

const logger = getLogger(['practice', 'listeners']);
const APP_URL = config.app.appUrl;

/**
 * Register all practice event listeners
 */
const registerPracticeListeners = (): void => {
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

  // Payment succeeded - send receipts (mapped from IntakePaymentSucceeded)
  Event.listen(IntakePaymentSucceeded, async (payload) => {
    // Map intake payload fields to local variables for templates
    const customer = {
      email: payload.client_email ?? '',
      name: payload.client_name ?? 'Valued Client',
    };

    const payment = {
      id: payload.uuid,
      invoiceNumber: payload.intake_payment_id || payload.uuid.slice(0, 8).toUpperCase(),
      amount: payload.amount,
      method: 'stripe',
    };

    // Generic business details (should come from practice info in real scenario)
    const business = {
      name: 'The Practice',
      supportEmail: 'support@blawby.com',
    };

    const items = [
      {
        description: 'Legal Consultation / Service Intake',
        amount: payload.amount,
      },
    ];

    // 1. Send Customer Receipt
    if (customer.email) {
      void queueManager
        .addEmailJob(
          EMAIL_TEMPLATES.CUSTOMER_PAYMENT_RECEIPT,
          customer.email,
          `Your receipt from ${business.name} - ${payment.invoiceNumber}`,
          {
            recipientEmail: customer.email,
            recipientName: customer.name,
            businessName: business.name,
            invoiceNumber: payment.invoiceNumber,
            amountPaid: payment.amount,
            amountDue: payment.amount,
            paidAt: payload.succeeded_at,
            lineItems: items,
            paymentMethod: payment.method,
            supportEmail: business.supportEmail,
          }
        )
        .catch((error) => {
          logError('Failed to queue customer receipt email', error, {
            invoiceNumber: payment.invoiceNumber,
            method: payment.method,
          });
        });
    }

    // 2. Send Team Notification
    void queueManager
      .addEmailJob(
        EMAIL_TEMPLATES.TEAM_PAYMENT_RECEIPT,
        'support@blawby.com', // Default support/owner email
        `Payment of ${new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(payment.amount / 100)} received from ${
          customer.name === 'Valued Client' ? customer.email : customer.name
        }`,
        {
          recipientEmail: 'support@blawby.com',
          recipientName: 'Team',
          businessName: business.name,
          invoiceNumber: payment.invoiceNumber,
          amountPaid: payment.amount,
          lineItems: items,
          paymentMethod: payment.method,
          invoiceUrl: `${APP_URL}/dashboard/intakes/${payload.uuid}`,
          supportEmail: 'support@blawby.com',
        }
      )
      .catch((error) => {
        logError('Failed to queue team receipt email', error, {
          invoiceNumber: payment.invoiceNumber,
        });
      });
  });

  logger.info('Practice event listeners registered');
};

export { registerPracticeListeners };
