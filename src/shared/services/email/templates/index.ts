/**
 * Email Templates Index
 *
 * Central export point for all email templates and the render function
 */

import { EMAIL_TEMPLATES, type EmailTemplateName, type TemplateDataMap } from '@/shared/services/email/email.types';

// Auth templates
import { changeEmailConfirmationTemplate } from '@/shared/services/email/templates/auth/change-email-confirmation';
import { emailVerificationTemplate } from '@/shared/services/email/templates/auth/email-verification';
import { magicLinkTemplate } from '@/shared/services/email/templates/auth/magic-link';
import { passwordResetTemplate } from '@/shared/services/email/templates/auth/password-reset';

// Customer templates
import { customerPaymentReceipt } from '@/shared/services/email/templates/customer/payment-receipt';
import { customerPaymentRefundRequest } from '@/shared/services/email/templates/customer/payment-refund-request';
import { customerPaymentRefunded } from '@/shared/services/email/templates/customer/payment-refunded';
import { customerPaymentRefundRejected } from '@/shared/services/email/templates/customer/payment-rejected';
import { customerPaymentRequest } from '@/shared/services/email/templates/customer/payment-request';

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
import { intakeAccepted } from '@/shared/services/email/templates/intake/intake-accepted';
import { intakeDeclined } from '@/shared/services/email/templates/intake/intake-declined';
import { intakeNewNotification } from '@/shared/services/email/templates/intake/new-intake-notification';
import { intakeSubmissionReceived } from '@/shared/services/email/templates/intake/submission-received';

// Matter templates
import { conflictCheckReviewRequired } from '@/shared/services/email/templates/engagement-contracts/conflict-check-review-required';
import { engagementContractAccepted } from '@/shared/services/email/templates/engagement-contracts/engagement-contract-accepted';
import { engagementContractDeclined } from '@/shared/services/email/templates/engagement-contracts/engagement-contract-declined';
import { engagementContractSent } from '@/shared/services/email/templates/engagement-contracts/engagement-contract-sent';
import { engagementContractSignedCopy } from '@/shared/services/email/templates/engagement-contracts/engagement-contract-signed-copy';
import { matterClosed } from '@/shared/services/email/templates/matter/matter-closed';
import { matterOpened } from '@/shared/services/email/templates/matter/matter-opened';

// Template registry with explicit mapping
type TemplateRegistry = {
  [T in EmailTemplateName]: (data: TemplateDataMap[T]) => string | Promise<string>;
};

const templateRegistry: TemplateRegistry = {
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
};

export type { TemplateDataMap } from '@/shared/services/email/email.types';

/**
 * Render an email template by name in a type-safe way
 */
export const renderTemplate = async <T extends EmailTemplateName>(
  templateName: T,
  data: TemplateDataMap[T]
): Promise<string> => {
  const template = templateRegistry[templateName];
  if (!template) {
    throw new Error(`Unknown email template: ${templateName}`);
  }
  return template(data);
};

// Re-export individual templates for direct use
export {
  changeEmailConfirmationTemplate,
  conflictCheckReviewRequired,
  customerPaymentReceipt,
  customerPaymentRequest,
  emailVerificationTemplate,
  engagementContractAccepted,
  engagementContractDeclined,
  engagementContractSent,
  engagementContractSignedCopy,
  intakeAccepted,
  intakeDeclined,
  intakeNewNotification,
  intakeSubmissionReceived,
  magicLinkTemplate,
  matterClosed,
  matterOpened,
  passwordResetTemplate,
  payoutSent,
  practiceInvitation,
  stripeConnectStatus,
  stripeConnectWelcome,
  teamPaymentReceipt,
  welcomeEmail,
};
