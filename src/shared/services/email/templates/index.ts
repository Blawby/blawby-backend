/**
 * Email Templates Index
 *
 * Central export point for all email templates and the render function
 */

// Customer templates

// Auth templates
import { magicLinkTemplate } from './auth/magic-link';

// Customer templates
import { customerPaymentReceipt } from './customer/payment-receipt';
import { customerPaymentRequest } from './customer/payment-request';
import {
  EMAIL_TEMPLATES,
  type EmailTemplateName,
  type CustomerPaymentReceiptData,
  type CustomerPaymentRequestData,
  type TeamPaymentReceiptData,
  type WelcomeEmailData,
  type StripeConnectWelcomeData,
  type StripeConnectStatusData,
  type PayoutSentData,
  type ScheduledEventData,
  type MagicLinkData,
} from '@/shared/services/email/email.types';

// Team templates

// Onboarding templates
import { payoutSent } from '@/shared/services/email/templates/onboarding/payout-sent';
import { stripeConnectStatus } from '@/shared/services/email/templates/onboarding/stripe-connect-status';
import { stripeConnectWelcome } from '@/shared/services/email/templates/onboarding/stripe-connect-welcome';
import { welcomeEmail } from '@/shared/services/email/templates/onboarding/welcome';

// Event templates
import { scheduledEventTemplate } from '@/shared/services/email/templates/scheduled-event';
import { teamPaymentReceipt } from '@/shared/services/email/templates/team/payment-receipt';


/**
 * Mapping of email templates to their specific data types
 */
export interface TemplateDataMap {
  [EMAIL_TEMPLATES.CUSTOMER_PAYMENT_RECEIPT]: CustomerPaymentReceiptData;
  [EMAIL_TEMPLATES.CUSTOMER_PAYMENT_REQUEST]: CustomerPaymentRequestData;
  [EMAIL_TEMPLATES.CUSTOMER_CUSTOM_RECEIPT]: CustomerPaymentReceiptData;
  [EMAIL_TEMPLATES.CUSTOMER_REFUND_INITIATED]: CustomerPaymentReceiptData;
  [EMAIL_TEMPLATES.CUSTOMER_REFUND_COMPLETED]: CustomerPaymentReceiptData;
  [EMAIL_TEMPLATES.CUSTOMER_PAYMENT_REJECTED]: CustomerPaymentReceiptData;
  [EMAIL_TEMPLATES.TEAM_PAYMENT_RECEIPT]: TeamPaymentReceiptData;
  [EMAIL_TEMPLATES.TEAM_CUSTOM_RECEIPT]: TeamPaymentReceiptData;
  [EMAIL_TEMPLATES.TEAM_REFUND_REQUEST]: TeamPaymentReceiptData;
  [EMAIL_TEMPLATES.TEAM_INVITATION]: WelcomeEmailData;
  [EMAIL_TEMPLATES.WELCOME]: WelcomeEmailData;
  [EMAIL_TEMPLATES.STRIPE_CONNECT_WELCOME]: StripeConnectWelcomeData;
  [EMAIL_TEMPLATES.STRIPE_CONNECT_STATUS]: StripeConnectStatusData;
  [EMAIL_TEMPLATES.PAYOUT_SENT]: PayoutSentData;
  [EMAIL_TEMPLATES.SCHEDULED_EVENT]: ScheduledEventData;
  [EMAIL_TEMPLATES.MAGIC_LINK]: MagicLinkData;
}

// Template registry with explicit mapping
const templateRegistry = {
  // Customer templates
  [EMAIL_TEMPLATES.CUSTOMER_PAYMENT_RECEIPT]: customerPaymentReceipt,
  [EMAIL_TEMPLATES.CUSTOMER_PAYMENT_REQUEST]: customerPaymentRequest,
  [EMAIL_TEMPLATES.CUSTOMER_CUSTOM_RECEIPT]: customerPaymentReceipt,
  [EMAIL_TEMPLATES.CUSTOMER_REFUND_INITIATED]:
    customerPaymentReceipt, // Intentional reuse: refund details are similar to receipts
  [EMAIL_TEMPLATES.CUSTOMER_REFUND_COMPLETED]:
    customerPaymentReceipt, // Intentional reuse: refund details are similar to receipts
  [EMAIL_TEMPLATES.CUSTOMER_PAYMENT_REJECTED]:
    customerPaymentReceipt, // Intentional reuse: notification uses receipt layout

  // Team templates
  [EMAIL_TEMPLATES.TEAM_PAYMENT_RECEIPT]: teamPaymentReceipt,
  [EMAIL_TEMPLATES.TEAM_CUSTOM_RECEIPT]: teamPaymentReceipt, // Reusing team receipt for custom cases
  [EMAIL_TEMPLATES.TEAM_REFUND_REQUEST]: teamPaymentReceipt, // Intentional reuse: notification uses team receipt layout
  [EMAIL_TEMPLATES.TEAM_INVITATION]: welcomeEmail, // Intentional reuse: uses welcome layout for invitations

  // Onboarding templates
  [EMAIL_TEMPLATES.WELCOME]: welcomeEmail,
  [EMAIL_TEMPLATES.STRIPE_CONNECT_WELCOME]: stripeConnectWelcome,
  [EMAIL_TEMPLATES.STRIPE_CONNECT_STATUS]: stripeConnectStatus,
  [EMAIL_TEMPLATES.PAYOUT_SENT]: payoutSent,
  [EMAIL_TEMPLATES.SCHEDULED_EVENT]: scheduledEventTemplate,
  [EMAIL_TEMPLATES.MAGIC_LINK]: magicLinkTemplate,
} as const;

/**
 * Render an email template by name in a type-safe way
 */
export const renderTemplate = <T extends EmailTemplateName>(
  templateName: T,
  data: TemplateDataMap[T],
): string => {
  const templateFn = (templateRegistry as Record<string, Function>)[templateName];

  if (!templateFn) {
    throw new Error(`Unknown email template: ${templateName}`);
  }

  return templateFn(data);
};

// Re-export individual templates for direct use
export {
  customerPaymentReceipt,
  customerPaymentRequest,
  teamPaymentReceipt,
  welcomeEmail,
  stripeConnectWelcome,
  stripeConnectStatus,
  payoutSent,
  scheduledEventTemplate,
  magicLinkTemplate,
};
