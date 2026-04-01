/**
 * Email Template Preview Routes
 */

import type {
  ChangeEmailConfirmationData,
  CustomerPaymentReceiptData,
  EmailVerificationData,
  MagicLinkData,
  PasswordResetData,
  PracticeInvitationData,
  StripeConnectWelcomeData,
  WelcomeEmailData,
} from '@/shared/services/email/email.types';
import { Hono } from 'hono';
import { config } from '@/shared/config';
import { changeEmailConfirmationTemplate } from '@/shared/services/email/templates/auth/change-email-confirmation';
import { emailVerificationTemplate } from '@/shared/services/email/templates/auth/email-verification';
import { customerPaymentReceipt } from '@/shared/services/email/templates/customer/payment-receipt';
import { magicLinkTemplate } from '@/shared/services/email/templates/auth/magic-link';
import { passwordResetTemplate } from '@/shared/services/email/templates/auth/password-reset';
import { practiceInvitation } from '@/shared/services/email/templates/team/practice-invitation';
import { stripeConnectWelcome } from '@/shared/services/email/templates/onboarding/stripe-connect-welcome';
import { welcomeEmail } from '@/shared/services/email/templates/onboarding/welcome';

const app = new Hono();

// Production guard - disable all routes in production
app.use('*', async (c, next) => {
  if (config.env.isProduction) {
    return c.json({ error: 'Not available in production' }, 403);
  }
  return await next();
});

// Sample data for previews
const sampleMagicLinkData: MagicLinkData = {
  url: 'https://blawby.com/auth/magic-link?token=sample-token-123',
  year: 2026,
};

const samplePasswordResetData: PasswordResetData = {
  url: 'https://blawby.com/auth/reset-password?token=sample-reset-token-123',
  year: 2026,
};

const sampleEmailVerificationData: EmailVerificationData = {
  url: 'https://blawby.com/api/auth/verify-email?token=sample-verify-token-123&callbackURL=https%3A%2F%2Fblawby.com%2Fsettings%2Faccount',
  year: 2026,
};

const sampleChangeEmailConfirmationData: ChangeEmailConfirmationData = {
  url: 'https://blawby.com/api/auth/verify-email?token=sample-change-email-token-123&callbackURL=https%3A%2F%2Fblawby.com%2Fsettings%2Faccount',
  newEmail: 'new-email@example.com',
  year: 2026,
};

const samplePaymentReceiptData: CustomerPaymentReceiptData = {
  recipientEmail: 'client@example.com',
  recipientName: 'John Doe',
  businessName: 'Smith & Associates Law Firm',
  teamPhotoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/27bc2bf2-8582-4ed1-e77c-45d7a3215b00/public',
  invoiceNumber: 'INV-2026-001',
  amountPaid: 150000, // $1,500.00 in cents
  amountDue: 150000,
  paidAt: 'March 2, 2026',
  lineItems: [
    {
      description: 'Legal Consultation - Initial Case Review',
      quantity: 1,
      unitPrice: 50000, // $500.00
      amount: 50000, // $500.00
    },
    {
      description: 'Document Preparation & Filing',
      quantity: 2,
      unitPrice: 25000, // $250.00
      amount: 50000, // $500.00
    },
    {
      description: 'Court Appearance Fee',
      quantity: 1,
      unitPrice: 50000, // $500.00
      amount: 50000, // $500.00
    },
  ],
  paymentMethod: 'Credit Card ending in 4242',
  invoicePDFUrl: 'https://blawby.com/invoices/INV-2026-001.pdf',
  supportEmail: 'support@blawby.com',
  supportUrl: 'https://blawby.com/help',
};

const sampleWelcomeData: WelcomeEmailData = {
  recipientEmail: 'lawyer@example.com',
  recipientName: 'Sarah Johnson',
  dashboardUrl: 'https://blawby.com/dashboard',
  tutorialUrl: 'https://blawby.com/tutorials/account-basics',
  supportUrl: 'https://blawby.com/help',
};

const sampleStripeConnectData: StripeConnectWelcomeData = {
  recipientEmail: 'lawyer@example.com',
  recipientName: 'Sarah Johnson',
  dashboardUrl: 'https://blawby.com/dashboard',
  tutorialUrl: 'https://blawby.com/tutorials/getting-started',
  supportUrl: 'https://blawby.com/help',
};

const samplePracticeInvitationData: PracticeInvitationData = {
  recipientEmail: 'associate@example.com',
  recipientName: 'Michael Chen',
  inviterName: 'Sarah Johnson',
  practiceName: 'Smith & Associates Law Firm',
  inviteLink: 'https://blawby.com/invite/abc123def456',
};

// Magic Link Preview
app.get('/magic-link', (c) => {
  const html = magicLinkTemplate(sampleMagicLinkData);
  return c.html(html);
});

app.get('/password-reset', (c) => {
  const html = passwordResetTemplate(samplePasswordResetData);
  return c.html(html);
});

app.get('/email-verification', (c) => {
  const html = emailVerificationTemplate(sampleEmailVerificationData);
  return c.html(html);
});

app.get('/change-email-confirmation', (c) => {
  const html = changeEmailConfirmationTemplate(sampleChangeEmailConfirmationData);
  return c.html(html);
});

// Payment Receipt Preview
app.get('/payment-receipt', (c) => {
  const html = customerPaymentReceipt(samplePaymentReceiptData);
  return c.html(html);
});

// Welcome Email Preview
app.get('/welcome', (c) => {
  const html = welcomeEmail(sampleWelcomeData);
  return c.html(html);
});

// Stripe Connect Welcome Preview
app.get('/stripe-connect-welcome', (c) => {
  const html = stripeConnectWelcome(sampleStripeConnectData);
  return c.html(html);
});

// Practice Invitation Preview
app.get('/practice-invitation', (c) => {
  const html = practiceInvitation(samplePracticeInvitationData);
  return c.html(html);
});

export default app;
