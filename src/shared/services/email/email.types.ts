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
  CUSTOMER_REFUND_REQUEST: 'customer-payment-refund-request',
  CUSTOMER_REFUND_APPROVED: 'customer-payment-refunded',
  CUSTOMER_REFUND_REJECTED: 'customer-payment-rejected',
  // Team emails
  TEAM_PAYMENT_RECEIPT: 'team-payment-receipt',
  TEAM_CUSTOM_RECEIPT: 'team-custom-receipt',
  TEAM_REFUND_REQUEST: 'team-refund-request',
  TEAM_REFUND_PROCESSED: 'team-payment-refunded',
  PRACTICE_INVITATION: 'practice-invitation',
  // Onboarding emails
  WELCOME: 'welcome',
  STRIPE_CONNECT_WELCOME: 'stripe-connect-welcome',
  STRIPE_CONNECT_STATUS: 'stripe-connect-status',
  PAYOUT_SENT: 'payout-sent',
  // Events
  SCHEDULED_EVENT: 'scheduled-event',
  // Auth
  MAGIC_LINK: 'magic-link',
  PASSWORD_RESET: 'password-reset',
  EMAIL_VERIFICATION: 'email-verification',
  CHANGE_EMAIL_CONFIRMATION: 'change-email-confirmation',
  // Intakes
  INTAKE_SUBMISSION_RECEIVED: 'intake-submission-received',
  INTAKE_NEW_NOTIFICATION: 'intake-new-notification',
  INTAKE_ACCEPTED: 'intake-accepted',
  INTAKE_DECLINED: 'intake-declined',
  // Matters
  MATTER_OPENED: 'matter-opened',
  MATTER_CLOSED: 'matter-closed',
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
/**
 * Magic Link Email Data
 */
export interface MagicLinkData {
  url: string;
  year: number;
}

export interface PasswordResetData {
  url: string;
  year: number;
}

export interface EmailVerificationData {
  url: string;
  year: number;
}

export interface ChangeEmailConfirmationData {
  url: string;
  newEmail: string;
  year: number;
}

// Line item for invoices/receipts
export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number; // In cents
  amount: number; // In cents (quantity * unitPrice)
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
  amountPaid: number; // In cents
  amountDue: number; // In cents
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
  amountDue: number; // In cents
  amountPaid: number; // In cents
  amountRemaining: number; // In cents
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
  amountPaid: number; // In cents
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
  amountRefunded: number; // In cents
  lineItems: LineItem[];
  invoiceUrl?: string;
  supportEmail: string;
  supportUrl?: string;
}

// Practice invitation data
export interface PracticeInvitationData extends BaseEmailData {
  inviterName: string;
  practiceName: string;
  inviteLink: string;
}

// Intake submission received data (prospect-facing)
export interface IntakeSubmissionReceivedData extends BaseEmailData {
  practiceName: string;
  submittedAt: string;
}

// Intake new notification data (practice-facing)
export interface IntakeNewNotificationData extends BaseEmailData {
  clientName: string;
  clientEmail: string;
  amount: number;
  intakeUrl: string;
  practiceName: string;
}

// Intake accepted data (prospect-facing)
export interface IntakeAcceptedData extends BaseEmailData {
  practiceName: string;
}

// Intake declined data (prospect-facing)
export interface IntakeDeclinedData extends BaseEmailData {
  practiceName: string;
  reason?: string;
}

// Matter opened data (client-facing)
export interface MatterOpenedData extends BaseEmailData {
  matterTitle: string;
  practiceName: string;
  dashboardUrl: string;
}

// Matter closed data (client-facing)
export interface MatterClosedData extends BaseEmailData {
  matterTitle: string;
  practiceName: string;
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
