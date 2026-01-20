/**
 * Email Types
 *
 * Type definitions for email templates and payloads
 */

// Email template names
export const EMAIL_TEMPLATES = {
  // Customer emails
  CUSTOMER_PAYMENT_RECEIPT: 'customer-payment-receipt',
  CUSTOMER_PAYMENT_REQUEST: 'customer-payment-request',
  CUSTOMER_CUSTOM_RECEIPT: 'customer-custom-receipt',
  CUSTOMER_REFUND_INITIATED: 'customer-refund-initiated',
  CUSTOMER_REFUND_COMPLETED: 'customer-refund-completed',
  CUSTOMER_PAYMENT_REJECTED: 'customer-payment-rejected',
  // Team emails
  TEAM_PAYMENT_RECEIPT: 'team-payment-receipt',
  TEAM_CUSTOM_RECEIPT: 'team-custom-receipt',
  TEAM_REFUND_REQUEST: 'team-refund-request',
  TEAM_INVITATION: 'team-invitation',
  // Onboarding emails
  WELCOME: 'welcome',
  STRIPE_CONNECT_WELCOME: 'stripe-connect-welcome',
  STRIPE_CONNECT_STATUS: 'stripe-connect-status',
  PAYOUT_SENT: 'payout-sent',
  // Events
  SCHEDULED_EVENT: 'scheduled-event',
} as const;

export type EmailTemplateName = (typeof EMAIL_TEMPLATES)[keyof typeof EMAIL_TEMPLATES];

/**
 * Scheduled Event Data
 */
export interface ScheduledEventData {
  recipientEmail: string;
  recipientName: string;
  teamName: string;
  paymentUrl: string;
  supportUrl: string;
}

// Line item for invoices/receipts
export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number; // in cents
  amount: number; // in cents (quantity * unitPrice)
}

// Base email data
export interface BaseEmailData {
  recipientEmail: string;
  recipientName: string;
}

// Customer payment receipt data
export interface CustomerPaymentReceiptData extends BaseEmailData {
  businessName: string;
  teamPhotoUrl: string;
  invoiceNumber: string;
  amountPaid: number; // in cents
  amountDue: number; // in cents
  paidAt: string;
  lineItems: LineItem[];
  paymentMethod?: string;
  invoicePDFUrl?: string;
  supportEmail: string;
  supportUrl?: string;
}

// Customer payment request (invoice) data
export interface CustomerPaymentRequestData extends BaseEmailData {
  businessName: string;
  teamPhotoUrl: string;
  invoiceNumber: string;
  amountDue: number; // in cents
  amountPaid: number; // in cents
  amountRemaining: number; // in cents
  dueDate: string;
  lineItems: LineItem[];
  paymentLink: string;
  supportEmail: string;
  supportUrl?: string;
}

// Team payment receipt data
export interface TeamPaymentReceiptData extends BaseEmailData {
  businessName: string;
  invoiceNumber: string;
  amountPaid: number; // in cents
  lineItems: LineItem[];
  paymentMethod?: string;
  payingOnBehalfOf?: string;
  invoiceUrl: string;
  supportEmail: string;
  supportUrl?: string;
}

// Welcome email data
export interface WelcomeEmailData extends BaseEmailData {
  dashboardUrl: string;
  tutorialUrl: string;
  supportUrl: string;
}

// Stripe Connect Welcome data
export interface StripeConnectWelcomeData extends BaseEmailData {
  dashboardUrl: string;
  tutorialUrl: string;
  supportUrl: string;
}

// Stripe Connect Status data (KYC required)
export interface StripeConnectStatusData extends BaseEmailData {
  dashboardUrl: string;
  tutorialUrl: string;
  supportUrl: string;
}

// Payout sent data
export interface PayoutSentData extends BaseEmailData {
  businessName: string;
  dashboardUrl: string;
}

// Refund data (for both customer and team refund emails)
export interface RefundData extends BaseEmailData {
  businessName: string;
  invoiceNumber: string;
  amountRefunded: number; // in cents
  lineItems: LineItem[];
  invoiceUrl?: string;
  supportEmail: string;
  supportUrl?: string;
}

// Team invitation data
export interface TeamInvitationData extends BaseEmailData {
  inviterName: string;
  teamName: string;
  inviteLink: string;
}

// Email job payload (what gets queued)
export interface EmailJobPayload {
  template: EmailTemplateName;
  to: string;
  subject: string;
  data: Record<string, unknown>;
}

// Email send options
export interface EmailSendOptions {
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
}
