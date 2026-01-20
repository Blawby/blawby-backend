/**
 * Email Templates Index
 *
 * Central export point for all email templates and the render function
 */

import { EMAIL_TEMPLATES, type EmailTemplateName } from '../email.types';

// Customer templates
import { customerPaymentReceipt } from './customer/payment-receipt';
import { customerPaymentRequest } from './customer/payment-request';

// Team templates
import { teamPaymentReceipt } from './team/payment-receipt';

// Onboarding templates
import { welcomeEmail } from './onboarding/welcome';
import { stripeConnectWelcome } from './onboarding/stripe-connect-welcome';
import { stripeConnectStatus } from './onboarding/stripe-connect-status';
import { payoutSent } from './onboarding/payout-sent';

// Event templates
import { scheduledEventTemplate } from './scheduled-event';

// Template render function type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TemplateRenderFn = (data: any) => string;

// Template registry - uses type casting to satisfy TemplateRenderFn
const templateRegistry: Record<EmailTemplateName, TemplateRenderFn> = {
  // Customer templates
  [EMAIL_TEMPLATES.CUSTOMER_PAYMENT_RECEIPT]: customerPaymentReceipt as TemplateRenderFn,
  [EMAIL_TEMPLATES.CUSTOMER_PAYMENT_REQUEST]: customerPaymentRequest as TemplateRenderFn,
  [EMAIL_TEMPLATES.CUSTOMER_CUSTOM_RECEIPT]: customerPaymentReceipt as TemplateRenderFn,
  [EMAIL_TEMPLATES.CUSTOMER_REFUND_INITIATED]: customerPaymentReceipt as TemplateRenderFn,
  [EMAIL_TEMPLATES.CUSTOMER_REFUND_COMPLETED]: customerPaymentReceipt as TemplateRenderFn,
  [EMAIL_TEMPLATES.CUSTOMER_PAYMENT_REJECTED]: customerPaymentReceipt as TemplateRenderFn,

  // Team templates
  [EMAIL_TEMPLATES.TEAM_PAYMENT_RECEIPT]: teamPaymentReceipt as TemplateRenderFn,
  [EMAIL_TEMPLATES.TEAM_CUSTOM_RECEIPT]: teamPaymentReceipt as TemplateRenderFn,
  [EMAIL_TEMPLATES.TEAM_REFUND_REQUEST]: teamPaymentReceipt as TemplateRenderFn,
  [EMAIL_TEMPLATES.TEAM_INVITATION]: welcomeEmail as TemplateRenderFn,

  // Onboarding templates
  [EMAIL_TEMPLATES.WELCOME]: welcomeEmail as TemplateRenderFn,
  [EMAIL_TEMPLATES.STRIPE_CONNECT_WELCOME]: stripeConnectWelcome as TemplateRenderFn,
  [EMAIL_TEMPLATES.STRIPE_CONNECT_STATUS]: stripeConnectStatus as TemplateRenderFn,
  [EMAIL_TEMPLATES.PAYOUT_SENT]: payoutSent as TemplateRenderFn,
  [EMAIL_TEMPLATES.SCHEDULED_EVENT]: scheduledEventTemplate as TemplateRenderFn,
};

/**
 * Render an email template by name
 */
export const renderTemplate = (templateName: EmailTemplateName, data: Record<string, unknown>): string => {
  const templateFn = templateRegistry[templateName];

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
};
