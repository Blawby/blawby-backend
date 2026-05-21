/**
 * Email Templates Index
 *
 * Central export point for all email templates and the render function
 */

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
  type MagicLinkData,
  type PasswordResetData,
  type EmailVerificationData,
  type ChangeEmailConfirmationData,
  type PracticeInvitationData,
  type IntakeSubmissionReceivedData,
  type IntakeNewNotificationData,
  type IntakeAcceptedData,
  type IntakeDeclinedData,
  type MatterOpenedData,
  type MatterClosedData,
  type EngagementContractSentData,
  type EngagementContractAcceptedData,
  type EngagementContractSignedCopyData,
  type EngagementContractDeclinedData,
  type ConflictCheckReviewRequiredData,
} from '@/shared/services/email/email.types';

// Auth templates
import { magicLinkTemplate } from '@/shared/services/email/templates/auth/magic-link';
import { passwordResetTemplate } from '@/shared/services/email/templates/auth/password-reset';
import { emailVerificationTemplate } from '@/shared/services/email/templates/auth/email-verification';
import { changeEmailConfirmationTemplate } from '@/shared/services/email/templates/auth/change-email-confirmation';

// Customer templates
import { customerPaymentReceipt } from '@/shared/services/email/templates/customer/payment-receipt';
import { customerPaymentRequest } from '@/shared/services/email/templates/customer/payment-request';
import { customerPaymentRefundRequest } from '@/shared/services/email/templates/customer/payment-refund-request';
import { customerPaymentRefunded } from '@/shared/services/email/templates/customer/payment-refunded';
import { customerPaymentRefundRejected } from '@/shared/services/email/templates/customer/payment-rejected';

// Onboarding templates
import { payoutSent } from '@/shared/services/email/templates/onboarding/payout-sent';
import { stripeConnectStatus } from '@/shared/services/email/templates/onboarding/stripe-connect-status';
import { stripeConnectWelcome } from '@/shared/services/email/templates/onboarding/stripe-connect-welcome';
import { welcomeEmail } from '@/shared/services/email/templates/onboarding/welcome';

// Team templates
import { teamPaymentReceipt } from '@/shared/services/email/templates/team/payment-receipt';
import { teamPaymentRefundRequest } from '@/shared/services/email/templates/team/payment-refund-request';
import { teamPaymentRefunded } from '@/shared/services/email/templates/team/payment-refunded';
import { practiceInvitation } from '@/shared/services/email/templates/team/practice-invitation';

// Intake templates
import { intakeSubmissionReceived } from '@/shared/services/email/templates/intake/submission-received';
import { intakeNewNotification } from '@/shared/services/email/templates/intake/new-intake-notification';
import { intakeAccepted } from '@/shared/services/email/templates/intake/intake-accepted';
import { intakeDeclined } from '@/shared/services/email/templates/intake/intake-declined';

// Matter templates
import { matterOpened } from '@/shared/services/email/templates/matter/matter-opened';
import { matterClosed } from '@/shared/services/email/templates/matter/matter-closed';
import { engagementContractSent } from '@/shared/services/email/templates/engagement-contracts/engagement-contract-sent';
import { engagementContractAccepted } from '@/shared/services/email/templates/engagement-contracts/engagement-contract-accepted';
import { engagementContractSignedCopy } from '@/shared/services/email/templates/engagement-contracts/engagement-contract-signed-copy';
import { engagementContractDeclined } from '@/shared/services/email/templates/engagement-contracts/engagement-contract-declined';
import { conflictCheckReviewRequired } from '@/shared/services/email/templates/engagement-contracts/conflict-check-review-required';

/**
 * Mapping of email templates to their specific data types
 */
export interface TemplateDataMap {
  [EMAIL_TEMPLATES.CUSTOMER_PAYMENT_RECEIPT]: CustomerPaymentReceiptData;
  [EMAIL_TEMPLATES.CUSTOMER_PAYMENT_REQUEST]: CustomerPaymentRequestData;
  [EMAIL_TEMPLATES.CUSTOMER_CUSTOM_RECEIPT]: CustomerPaymentReceiptData;
  [EMAIL_TEMPLATES.CUSTOMER_REFUND_REQUEST]: CustomerPaymentReceiptData;
  [EMAIL_TEMPLATES.CUSTOMER_REFUND_APPROVED]: CustomerPaymentReceiptData;
  [EMAIL_TEMPLATES.CUSTOMER_REFUND_REJECTED]: CustomerPaymentReceiptData;
  [EMAIL_TEMPLATES.TEAM_PAYMENT_RECEIPT]: TeamPaymentReceiptData;
  [EMAIL_TEMPLATES.TEAM_CUSTOM_RECEIPT]: TeamPaymentReceiptData;
  [EMAIL_TEMPLATES.TEAM_REFUND_REQUEST]: TeamPaymentReceiptData;
  [EMAIL_TEMPLATES.TEAM_REFUND_PROCESSED]: TeamPaymentReceiptData;
  [EMAIL_TEMPLATES.PRACTICE_INVITATION]: PracticeInvitationData;
  [EMAIL_TEMPLATES.WELCOME]: WelcomeEmailData;
  [EMAIL_TEMPLATES.STRIPE_CONNECT_WELCOME]: StripeConnectWelcomeData;
  [EMAIL_TEMPLATES.STRIPE_CONNECT_STATUS]: StripeConnectStatusData;
  [EMAIL_TEMPLATES.PAYOUT_SENT]: PayoutSentData;
  [EMAIL_TEMPLATES.MAGIC_LINK]: MagicLinkData;
  [EMAIL_TEMPLATES.PASSWORD_RESET]: PasswordResetData;
  [EMAIL_TEMPLATES.EMAIL_VERIFICATION]: EmailVerificationData;
  [EMAIL_TEMPLATES.CHANGE_EMAIL_CONFIRMATION]: ChangeEmailConfirmationData;
  [EMAIL_TEMPLATES.INTAKE_SUBMISSION_RECEIVED]: IntakeSubmissionReceivedData;
  [EMAIL_TEMPLATES.INTAKE_NEW_NOTIFICATION]: IntakeNewNotificationData;
  [EMAIL_TEMPLATES.INTAKE_ACCEPTED]: IntakeAcceptedData;
  [EMAIL_TEMPLATES.INTAKE_DECLINED]: IntakeDeclinedData;
  [EMAIL_TEMPLATES.MATTER_OPENED]: MatterOpenedData;
  [EMAIL_TEMPLATES.MATTER_CLOSED]: MatterClosedData;
  [EMAIL_TEMPLATES.ENGAGEMENT_CONTRACT_SENT]: EngagementContractSentData;
  [EMAIL_TEMPLATES.ENGAGEMENT_CONTRACT_ACCEPTED]: EngagementContractAcceptedData;
  [EMAIL_TEMPLATES.ENGAGEMENT_CONTRACT_SIGNED_COPY]: EngagementContractSignedCopyData;
  [EMAIL_TEMPLATES.ENGAGEMENT_CONTRACT_DECLINED]: EngagementContractDeclinedData;
  [EMAIL_TEMPLATES.CONFLICT_CHECK_REVIEW_REQUIRED]: ConflictCheckReviewRequiredData;
}

// Template registry with explicit mapping
const templateRegistry = {
  // Customer templates
  [EMAIL_TEMPLATES.CUSTOMER_PAYMENT_RECEIPT]: customerPaymentReceipt,
  [EMAIL_TEMPLATES.CUSTOMER_PAYMENT_REQUEST]: customerPaymentRequest,
  [EMAIL_TEMPLATES.CUSTOMER_CUSTOM_RECEIPT]: customerPaymentReceipt,
  [EMAIL_TEMPLATES.CUSTOMER_REFUND_REQUEST]: customerPaymentRefundRequest,
  [EMAIL_TEMPLATES.CUSTOMER_REFUND_APPROVED]: customerPaymentRefunded,
  [EMAIL_TEMPLATES.CUSTOMER_REFUND_REJECTED]: customerPaymentRefundRejected,

  // Team templates
  [EMAIL_TEMPLATES.TEAM_PAYMENT_RECEIPT]: teamPaymentReceipt,
  [EMAIL_TEMPLATES.TEAM_CUSTOM_RECEIPT]: teamPaymentReceipt, // Reusing team receipt for custom cases
  [EMAIL_TEMPLATES.TEAM_REFUND_REQUEST]: teamPaymentRefundRequest,
  [EMAIL_TEMPLATES.TEAM_REFUND_PROCESSED]: teamPaymentRefunded,
  [EMAIL_TEMPLATES.PRACTICE_INVITATION]: practiceInvitation,

  // Onboarding templates

  // Onboarding templates
  [EMAIL_TEMPLATES.WELCOME]: welcomeEmail,
  [EMAIL_TEMPLATES.STRIPE_CONNECT_WELCOME]: stripeConnectWelcome,
  [EMAIL_TEMPLATES.STRIPE_CONNECT_STATUS]: stripeConnectStatus,
  [EMAIL_TEMPLATES.PAYOUT_SENT]: payoutSent,
  [EMAIL_TEMPLATES.MAGIC_LINK]: magicLinkTemplate,
  [EMAIL_TEMPLATES.PASSWORD_RESET]: passwordResetTemplate,
  [EMAIL_TEMPLATES.EMAIL_VERIFICATION]: emailVerificationTemplate,
  [EMAIL_TEMPLATES.CHANGE_EMAIL_CONFIRMATION]: changeEmailConfirmationTemplate,

  // Intake templates
  [EMAIL_TEMPLATES.INTAKE_SUBMISSION_RECEIVED]: intakeSubmissionReceived,
  [EMAIL_TEMPLATES.INTAKE_NEW_NOTIFICATION]: intakeNewNotification,
  [EMAIL_TEMPLATES.INTAKE_ACCEPTED]: intakeAccepted,
  [EMAIL_TEMPLATES.INTAKE_DECLINED]: intakeDeclined,

  // Matter templates
  [EMAIL_TEMPLATES.MATTER_OPENED]: matterOpened,
  [EMAIL_TEMPLATES.MATTER_CLOSED]: matterClosed,
  [EMAIL_TEMPLATES.ENGAGEMENT_CONTRACT_SENT]: engagementContractSent,
  [EMAIL_TEMPLATES.ENGAGEMENT_CONTRACT_ACCEPTED]: engagementContractAccepted,
  [EMAIL_TEMPLATES.ENGAGEMENT_CONTRACT_SIGNED_COPY]: engagementContractSignedCopy,
  [EMAIL_TEMPLATES.ENGAGEMENT_CONTRACT_DECLINED]: engagementContractDeclined,
  [EMAIL_TEMPLATES.CONFLICT_CHECK_REVIEW_REQUIRED]: conflictCheckReviewRequired,
} as const;

/**
 * Render an email template by name in a type-safe way
 */
export const renderTemplate = <T extends EmailTemplateName>(templateName: T, data: TemplateDataMap[T]): string => {
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
  practiceInvitation,
  stripeConnectWelcome,
  stripeConnectStatus,
  payoutSent,
  magicLinkTemplate,
  passwordResetTemplate,
  emailVerificationTemplate,
  changeEmailConfirmationTemplate,
  intakeSubmissionReceived,
  intakeNewNotification,
  intakeAccepted,
  intakeDeclined,
  matterOpened,
  matterClosed,
  engagementContractSent,
  engagementContractAccepted,
  engagementContractSignedCopy,
  engagementContractDeclined,
  conflictCheckReviewRequired,
};
