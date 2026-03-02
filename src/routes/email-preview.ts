/**
 * Email Template Preview Routes
 */

import { Hono } from 'hono';
import { magicLinkTemplate } from '@/shared/services/email/templates/auth/magic-link';
import { customerPaymentReceipt } from '@/shared/services/email/templates/customer/payment-receipt';
import { welcomeEmail } from '@/shared/services/email/templates/onboarding/welcome';
import { stripeConnectWelcome } from '@/shared/services/email/templates/onboarding/stripe-connect-welcome';
import { practiceInvitation } from '@/shared/services/email/templates/team/practice-invitation';
import type { MagicLinkData, CustomerPaymentReceiptData, WelcomeEmailData, StripeConnectWelcomeData, PracticeInvitationData } from '@/shared/services/email/email.types';

const app = new Hono();

// Production guard - disable all routes in production
app.use('*', async (c, next) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'Not available in production' }, 403);
  }
  await next();
});

// Sample data for previews
const sampleMagicLinkData: MagicLinkData = {
  url: 'https://blawby.com/auth/magic-link?token=sample-token-123',
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
