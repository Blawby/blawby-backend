import fs from 'node:fs';
import path from 'node:path';
import { type Context, Hono } from 'hono';
import type { AppContext } from '@/shared/types/hono';
import type {
  ChangeEmailConfirmationData,
  CustomerPaymentReceiptData,
  CustomerPaymentRequestData,
  EmailVerificationData,
  IntakeAcceptedData,
  IntakeDeclinedData,
  IntakeNewNotificationData,
  IntakeSubmissionReceivedData,
  MagicLinkData,
  MatterClosedData,
  MatterOpenedData,
  PayoutSentData,
  PasswordResetData,
  PracticeInvitationData,
  StripeConnectStatusData,
  StripeConnectWelcomeData,
  TeamPaymentReceiptData,
  WelcomeEmailData,
} from '@/shared/services/email/email.types';
import { customerPaymentReceipt } from '@/shared/services/email/templates/customer/payment-receipt';
import { customerPaymentRefundRejected } from '@/shared/services/email/templates/customer/payment-rejected';
import { customerPaymentRefundRequest } from '@/shared/services/email/templates/customer/payment-refund-request';
import { customerPaymentRefunded } from '@/shared/services/email/templates/customer/payment-refunded';
import { customerPaymentRequest } from '@/shared/services/email/templates/customer/payment-request';
import { changeEmailConfirmationTemplate } from '@/shared/services/email/templates/auth/change-email-confirmation';
import { emailVerificationTemplate } from '@/shared/services/email/templates/auth/email-verification';
import { magicLinkTemplate } from '@/shared/services/email/templates/auth/magic-link';
import { passwordResetTemplate } from '@/shared/services/email/templates/auth/password-reset';
import { payoutSent } from '@/shared/services/email/templates/onboarding/payout-sent';
import { practiceInvitation } from '@/shared/services/email/templates/team/practice-invitation';
import { stripeConnectStatus } from '@/shared/services/email/templates/onboarding/stripe-connect-status';
import { stripeConnectWelcome } from '@/shared/services/email/templates/onboarding/stripe-connect-welcome';
import { teamPaymentReceipt } from '@/shared/services/email/templates/team/payment-receipt';
import { teamPaymentRefundRequest } from '@/shared/services/email/templates/team/payment-refund-request';
import { teamPaymentRefunded } from '@/shared/services/email/templates/team/payment-refunded';
import { welcomeEmail } from '@/shared/services/email/templates/onboarding/welcome';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { intakeSubmissionReceived } from '@/shared/services/email/templates/intake/submission-received';
import { intakeNewNotification } from '@/shared/services/email/templates/intake/new-intake-notification';
import { intakeAccepted } from '@/shared/services/email/templates/intake/intake-accepted';
import { intakeDeclined } from '@/shared/services/email/templates/intake/intake-declined';
import { matterOpened } from '@/shared/services/email/templates/matter/matter-opened';
import { matterClosed } from '@/shared/services/email/templates/matter/matter-closed';
import { config } from '@/shared/config';
import { isProduction } from '@/shared/utils/env';
import { HttpStatus } from '@/shared/utils/result';

const http = new Hono<AppContext>();
http.use('*', injectAbility());

// Helper functions for URL generation (replacing missing @/shared/utils/urls)
const FRONTEND_URLS = {
  DASHBOARD: config.app.appUrl,
  HELP: `${config.app.appUrl}/help`,
  DOCS: `${config.app.appUrl}/docs`,
  GETTING_STARTED: `${config.app.appUrl}/getting-started`,
  VERIFICATION: `${config.app.appUrl}/verification`,
  PAYOUTS: `${config.app.appUrl}/payouts`,
};

const generateFrontendUrls = {
  practiceDashboard: (slug: string) => `${config.app.appUrl}/practice/${slug}`,
  practicePayoutsSettings: (slug: string) => `${config.app.appUrl}/practice/${slug}/settings/payouts`,
  invoices: (id: string) => `${config.app.appUrl}/invoices/${id}`,
  intakes: (id: string) => `${config.app.appUrl}/dashboard/intakes/${id}`,
  pay: (id: string) => `${config.app.appUrl}/pay/${id}`,
};

const EMAILS_DIR = path.join(process.cwd(), 'storage', 'emails');
const DEV_ONLY_ERROR = { error: 'Not available in production' } as const;

const guardDevelopmentOnly = (c: Context): Response | null => {
  if (isProduction()) {
    return c.json(DEV_ONLY_ERROR, HttpStatus.FORBIDDEN);
  }

  return null;
};

/**
 * List all saved emails
 */
http.get('/emails', async (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }

  if (!fs.existsSync(EMAILS_DIR)) {
    return c.html(`
      <div style="font-family: sans-serif; padding: 20px;">
        <h1>Email Previewer</h1>
        <p>No emails have been sent yet. Trigger an email to see it here.</p>
      </div>
    `);
  }

  const files = fs
    .readdirSync(EMAILS_DIR)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .reverse();

  const listItems = files
    .map((f) => {
      const filePath = path.join(EMAILS_DIR, f);
      const stat = fs.statSync(filePath);
      return `
      <li style="margin-bottom: 10px; border: 1px solid #ddd; padding: 10px; border-radius: 4px; list-style: none;">
        <a href="/api/dev/emails/${f}" style="text-decoration: none; color: #007bff; font-weight: bold;">
          ${f}
        </a>
        <div style="color: #666; font-size: 0.8em; margin-top: 5px;">
          Saved at: ${stat.mtime.toLocaleString()}
        </div>
      </li>
    `;
    })
    .join('');

  return c.html(`
    <div style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
      <h1 style="border-bottom: 2px solid #eee; padding-bottom: 10px;">Local Email Mailbox</h1>
      <ul style="padding: 0;">
        ${listItems || '<li>No emails found.</li>'}
      </ul>
    </div>
  `);
});

/**
 * View a specific email
 */
http.get('/emails/:filename', async (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }

  const filename = c.req.param('filename');
  const sanitizedFilename = path.basename(filename);

  if (!sanitizedFilename.endsWith('.html')) {
    return c.json({ error: 'Email not found' }, HttpStatus.NOT_FOUND);
  }

  const filePath = path.resolve(EMAILS_DIR, sanitizedFilename);

  // Ensure the resolved path is still within EMAILS_DIR
  if (!filePath.startsWith(EMAILS_DIR) || !fs.existsSync(filePath)) {
    return c.json({ error: 'Email not found' }, HttpStatus.NOT_FOUND);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return c.html(content);
});

// Sample data for previews
const sampleMagicLinkData: MagicLinkData = {
  url: `${FRONTEND_URLS.DASHBOARD}/auth/magic-link?token=sample-token-123`,
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
  invoicePDFUrl: generateFrontendUrls.invoices('INV-2026-001'),
  supportEmail: 'help@blawby.com',
  supportUrl: FRONTEND_URLS.HELP,
};

const sampleWelcomeData: WelcomeEmailData = {
  dashboardUrl: FRONTEND_URLS.DASHBOARD,
  recipientEmail: 'lawyer@example.com',
  recipientName: 'Sarah Johnson',
  supportUrl: FRONTEND_URLS.HELP,
  tutorialUrl: FRONTEND_URLS.GETTING_STARTED,
  practiceDashboardUrl: generateFrontendUrls.practiceDashboard('paul-yahoo'),
  payoutsUrl: generateFrontendUrls.practicePayoutsSettings('paul-yahoo'),
};

const sampleStripeConnectData: StripeConnectWelcomeData = {
  dashboardUrl: generateFrontendUrls.practiceDashboard('paul-yahoo'),
  recipientEmail: 'lawyer@example.com',
  recipientName: 'Sarah Johnson',
  supportUrl: FRONTEND_URLS.HELP,
  tutorialUrl: FRONTEND_URLS.GETTING_STARTED,
};

const samplePracticeInvitationData: PracticeInvitationData = {
  inviteLink: generateFrontendUrls.intakes('abc123def456'),
  inviterName: 'Sarah Johnson',
  practiceName: 'Smith & Associates Law Firm',
  recipientEmail: 'associate@example.com',
  recipientName: 'Michael Chen',
};

// Sample refund data (reuse payment receipt data structure)
const sampleRefundData: CustomerPaymentReceiptData = {
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
      amount: 150000,
      description: 'Legal Consultation',
      quantity: 1,
      unitPrice: 150000,
    },
  ],
  paymentMethod: 'Credit Card ending in 4242',
  invoicePDFUrl: generateFrontendUrls.invoices('INV-2026-001'),
  supportEmail: 'help@blawby.com',
  supportUrl: FRONTEND_URLS.HELP,
};

const sampleTeamRefundData: TeamPaymentReceiptData = {
  recipientEmail: 'client@example.com',
  recipientName: 'John Doe',
  businessName: 'Smith & Associates Law Firm',
  invoiceNumber: 'INV-2026-001',
  amountPaid: 150000, // $1,500.00 in cents
  lineItems: [
    {
      amount: 150000,
      description: 'Legal Consultation',
      quantity: 1,
      unitPrice: 150000,
    },
  ],
  paymentMethod: 'Credit Card ending in 4242',
  invoiceUrl: generateFrontendUrls.intakes('abc123'),
  supportEmail: 'help@blawby.com',
  supportUrl: FRONTEND_URLS.HELP,
};

const samplePaymentRequestData: CustomerPaymentRequestData = {
  recipientEmail: 'client@example.com',
  recipientName: 'John Doe',
  businessName: 'Smith & Associates Law Firm',
  teamPhotoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/27bc2bf2-8582-4ed1-e77c-45d7a3215b00/public',
  invoiceNumber: 'INV-2026-002',
  amountDue: 250000, // $2,500.00 in cents
  amountPaid: 0,
  amountRemaining: 250000,
  dueDate: 'March 15, 2026',
  lineItems: [
    {
      description: 'Estate Planning Consultation',
      quantity: 1,
      unitPrice: 150000, // $1,500.00
      amount: 150000, // $1,500.00
    },
    {
      description: 'Will Drafting & Review',
      quantity: 2,
      unitPrice: 50000, // $500.00
      amount: 100000, // $1,000.00
    },
  ],
  paymentLink: generateFrontendUrls.pay('INV-2026-002'),
  supportEmail: 'help@blawby.com',
  supportUrl: FRONTEND_URLS.HELP,
};

const sampleTeamPaymentReceiptData: TeamPaymentReceiptData = {
  amountPaid: 150000,
  businessName: 'Smith & Associates Law Firm',
  invoiceNumber: 'PAY-2026-001',
  invoiceUrl: generateFrontendUrls.invoices('PAY-2026-001'),
  lineItems: [
    {
      amount: 50000,
      description: 'Legal Consultation - Initial Case Review',
      quantity: 1,
      unitPrice: 50000,
    },
    {
      amount: 50000,
      description: 'Document Preparation & Filing',
      quantity: 2,
      unitPrice: 25000,
    },
    {
      amount: 50000,
      description: 'Court Appearance Fee',
      quantity: 1,
      unitPrice: 50000,
    },
  ],
  paymentMethod: 'Credit Card ending in 4242',
  recipientEmail: 'lawyer@example.com',
  recipientName: 'Sarah Johnson',
  supportEmail: 'help@blawby.com',
  supportUrl: FRONTEND_URLS.HELP,
};

const samplePayoutSentData: PayoutSentData = {
  businessName: 'Smith & Associates Law Firm',
  dashboardUrl: generateFrontendUrls.practiceDashboard('paul-yahoo'),
  recipientEmail: 'lawyer@example.com',
  recipientName: 'Sarah Johnson',
};

const sampleStripeConnectStatusData: StripeConnectStatusData = {
  dashboardUrl: generateFrontendUrls.practicePayoutsSettings('paul-yahoo'),
  recipientEmail: 'lawyer@example.com',
  recipientName: 'Sarah Johnson',
  supportUrl: FRONTEND_URLS.HELP,
  tutorialUrl: FRONTEND_URLS.VERIFICATION,
  payoutsUrl: generateFrontendUrls.practicePayoutsSettings('paul-yahoo'),
};

const sampleIntakeSubmissionReceivedData: IntakeSubmissionReceivedData = {
  recipientEmail: 'prospect@example.com',
  recipientName: 'Jane Smith',
  practiceName: 'Smith & Associates Law Firm',
  submittedAt: 'Apr 6, 2026 at 6:24 PM',
};

const sampleIntakeNewNotificationData: IntakeNewNotificationData = {
  recipientEmail: 'lawyer@example.com',
  recipientName: 'Sarah Johnson',
  clientName: 'Jane Smith',
  clientEmail: 'prospect@example.com',
  amount: 50000, // $500.00 in cents
  intakeUrl: generateFrontendUrls.intakes('abc123'),
  practiceName: 'Smith & Associates Law Firm',
  // Enhanced decision-making fields
  matterType: 'Personal Injury', // Clean practice service name
  jurisdiction: 'California',
  courtDate: 'May 15, 2026',
  hasDocuments: true,
  caseStrength: 0.75,
  desiredOutcome: 'Seeking compensation for medical expenses and lost wages',
  opposingParty: 'ABC Insurance Company',
  submittedAt: 'Apr 6, 2026 at 6:24 PM',
  intakeId: 'abc123',
  // Action URLs
  acceptUrl: `${generateFrontendUrls.intakes('abc123')}?action=accept`,
  declineUrl: `${generateFrontendUrls.intakes('abc123')}?action=decline`,
  // Full description for hyperlink
  description:
    "I was injured in a car accident on highway 101 when another driver ran a red light and hit my vehicle. I sustained neck and back injuries, my car was totaled, and I've been unable to work for the past 3 weeks.",
};

const sampleIntakeAcceptedData: IntakeAcceptedData = {
  recipientEmail: 'prospect@example.com',
  recipientName: 'Jane Smith',
  practiceName: 'Smith & Associates Law Firm',
};

const sampleIntakeDeclinedData: IntakeDeclinedData = {
  recipientEmail: 'prospect@example.com',
  recipientName: 'Jane Smith',
  practiceName: 'Smith & Associates Law Firm',
  reason: 'Unfortunately, we are not accepting new cases in this practice area at this time.',
};

const sampleMatterOpenedData: MatterOpenedData = {
  recipientEmail: 'client@example.com',
  recipientName: 'John Doe',
  matterTitle: 'Estate Planning for John Doe',
  practiceName: 'Smith & Associates Law Firm',
  dashboardUrl: generateFrontendUrls.practiceDashboard('paul-yahoo'),
};

const sampleMatterClosedData: MatterClosedData = {
  recipientEmail: 'client@example.com',
  recipientName: 'John Doe',
  matterTitle: 'Estate Planning for John Doe',
  practiceName: 'Smith & Associates Law Firm',
};

/**
 * Email template preview page
 */
http.get('/email-templates', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }

  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Templates Preview</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .audience-section {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      margin-bottom: 20px;
      overflow: hidden;
    }
    .audience-header {
      background: #1a202c;
      color: white;
      padding: 15px 20px;
      font-weight: 600;
      font-size: 18px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
    }
    .audience-header:hover {
      background: #2d3748;
    }
    .audience-header .toggle {
      font-size: 20px;
      transition: transform 0.2s;
    }
    .audience-header.collapsed .toggle {
      transform: rotate(-90deg);
    }
    .flow-description {
      background: #f8fafc;
      padding: 15px 20px;
      border-left: 4px solid #4299e1;
      margin: 0;
      font-size: 14px;
      color: #2d3748;
      line-height: 1.5;
    }
    .template-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
      gap: 20px;
      padding: 20px;
    }
    .template-card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .template-header {
      background: #4a5568;
      color: white;
      padding: 12px 16px;
      font-weight: 600;
      font-size: 14px;
      line-height: 1.3;
    }
    .template-content {
      height: 700px;
      overflow: auto;
      border: 1px solid #e5e5e5;
    }
    .template-content iframe {
      width: 100%;
      height: 100%;
      border: none;
      transform: scale(0.85);
      transform-origin: 0 0;
      width: 118%; /* 100% / 0.85 */
      height: 118%; /* 100% / 0.85 */
    }
    .mobile-frame {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #f5f5f5;
      border-radius: 8px;
    }
    .hidden {
      display: none;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📧 Email Templates Preview</h1>
    <p>Review all email templates organized by audience (Client vs Practice)</p>
  </div>

  <!-- CLIENT-FACING EMAILS -->
  <div class="audience-section">
    <div class="audience-header" onclick="toggleSection('client-section')">
      <span>👤 Client-Facing Emails (11 templates)</span>
      <span class="toggle">▼</span>
    </div>
    <div id="client-section">
      <p class="flow-description">
        <strong>Client Flow:</strong> These emails are sent to prospects and clients throughout their journey:<br>
        1. <strong>Intake:</strong> Submission received -> Case accepted/declined<br>
        2. <strong>Authentication:</strong> Magic link sign-in<br>
        3. <strong>Payment:</strong> Invoice requests -> Receipts -> Refund notifications<br>
        4. <strong>Matter Management:</strong> Matter opened -> Matter closed
      </p>
      <div class="template-grid">
        <div class="template-card">
          <div class="template-header">Reset your Blawby password</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/password-reset"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">Verify your email address</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/email-verification"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">New invoice from Smith & Associates INV-2026-002</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/payment-request"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">Sign in to Blawby</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/magic-link"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">We've received your submission</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/intake-submission-received"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">✅ Your case has been accepted</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/intake-accepted"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">❌ Your intake submission</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/intake-declined"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">🧾 Your receipt from Smith & Associates</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/payment-receipt"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">💰 Refund Request Received</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/customer-refund-request"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">✅ Refund Processed</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/customer-refunded"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">❌ Refund Request Not Approved</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/customer-refund-rejected"></iframe>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- PRACTICE-FACING EMAILS -->
  <div class="audience-section">
    <div class="audience-header" onclick="toggleSection('practice-section')">
      <span>⚖️ Practice-Facing Emails (9 templates)</span>
      <span class="toggle">▼</span>
    </div>
    <div id="practice-section">
      <p class="flow-description">
        <strong>Practice Flow:</strong> These emails are sent to lawyers, practice owners, and team members:<br>
        1. <strong>Onboarding:</strong> Welcome → Stripe setup → Payout notifications<br>
        2. <strong>Team Management:</strong> Practice invitations<br>
        3. <strong>Intake Management:</strong> New intake notifications<br>
        4. <strong>Financial:</strong> Team payment receipts → Refund requests<br>
        5. <strong>Automation:</strong> Scheduled payment reminders
      </p>
      <div class="template-grid">
        <div class="template-card">
          <div class="template-header">🎉 Welcome to Blawby!</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/welcome"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">🔗 Your Stripe account is connected!</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/stripe-connect-welcome"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">⚠️ Action required: Verify your account</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/stripe-connect-status"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">💸 A payout was sent to your bank account</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/payout-sent"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">👥 You've been invited to join Smith & Associates</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/practice-invitation"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">📬 New intake submission received</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/intake-new-notification"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">💳 Payment of $1,500.00 received</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/team-payment-receipt"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">💰 Refund Request Received</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/team-refund-request"></iframe>
            </div>
          </div>
        </div>

        <div class="template-card">
          <div class="template-header">✅ Refund Processed</div>
          <div class="template-content">
            <div class="mobile-frame">
              <iframe src="/api/dev/email-templates/team-refunded"></iframe>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    function toggleSection(sectionId) {
      const section = document.getElementById(sectionId);
      const header = section.previousElementSibling;

      if (section.classList.contains('hidden')) {
        section.classList.remove('hidden');
        header.classList.remove('collapsed');
      } else {
        section.classList.add('hidden');
        header.classList.add('collapsed');
      }
    }
  </script>
</body>
</html>
  `);
});

/**
 * Individual email template previews
 */
http.get('/email-templates/magic-link', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = magicLinkTemplate(sampleMagicLinkData);
  return c.html(html);
});

http.get('/email-templates/password-reset', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = passwordResetTemplate(samplePasswordResetData);
  return c.html(html);
});

http.get('/email-templates/email-verification', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = emailVerificationTemplate(sampleEmailVerificationData);
  return c.html(html);
});

http.get('/email-templates/change-email-confirmation', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = changeEmailConfirmationTemplate(sampleChangeEmailConfirmationData);
  return c.html(html);
});

http.get('/email-templates/payment-receipt', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = customerPaymentReceipt(samplePaymentReceiptData);
  return c.html(html);
});

http.get('/email-templates/welcome', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = welcomeEmail(sampleWelcomeData);
  return c.html(html);
});

http.get('/email-templates/stripe-connect-welcome', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = stripeConnectWelcome(sampleStripeConnectData);
  return c.html(html);
});

http.get('/email-templates/practice-invitation', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = practiceInvitation(samplePracticeInvitationData);
  return c.html(html);
});

http.get('/email-templates/payment-request', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = customerPaymentRequest(samplePaymentRequestData);
  return c.html(html);
});

http.get('/email-templates/team-payment-receipt', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = teamPaymentReceipt(sampleTeamPaymentReceiptData);
  return c.html(html);
});

// Customer refund templates
http.get('/email-templates/customer-refund-request', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = customerPaymentRefundRequest(sampleRefundData);
  return c.html(html);
});

http.get('/email-templates/customer-refunded', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = customerPaymentRefunded(sampleRefundData);
  return c.html(html);
});

http.get('/email-templates/customer-refund-rejected', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = customerPaymentRefundRejected(sampleRefundData);
  return c.html(html);
});

// Team refund templates
http.get('/email-templates/team-refund-request', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = teamPaymentRefundRequest(sampleTeamRefundData);
  return c.html(html);
});

http.get('/email-templates/team-refunded', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = teamPaymentRefunded(sampleTeamRefundData);
  return c.html(html);
});

http.get('/email-templates/payout-sent', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = payoutSent(samplePayoutSentData);
  return c.html(html);
});

http.get('/email-templates/stripe-connect-status', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = stripeConnectStatus(sampleStripeConnectStatusData);
  return c.html(html);
});

// Intake template routes
http.get('/email-templates/intake-submission-received', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = intakeSubmissionReceived(sampleIntakeSubmissionReceivedData);
  return c.html(html);
});

http.get('/email-templates/intake-new-notification', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = intakeNewNotification(sampleIntakeNewNotificationData);
  return c.html(html);
});

http.get('/email-templates/intake-accepted', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = intakeAccepted(sampleIntakeAcceptedData);
  return c.html(html);
});

http.get('/email-templates/intake-declined', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = intakeDeclined(sampleIntakeDeclinedData);
  return c.html(html);
});

// Matter template routes
http.get('/email-templates/matter-opened', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = matterOpened(sampleMatterOpenedData);
  return c.html(html);
});

http.get('/email-templates/matter-closed', (c) => {
  const devOnlyError = guardDevelopmentOnly(c);
  if (devOnlyError) {
    return devOnlyError;
  }
  const html = matterClosed(sampleMatterClosedData);
  return c.html(html);
});

export default http;
