import fs from 'node:fs';
import path from 'node:path';
import { Hono, type Context } from 'hono';
import type { AppContext } from '@/shared/types/hono';
import type {
  CustomerPaymentReceiptData,
  CustomerPaymentRequestData,
  MagicLinkData,
  PayoutSentData,
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
import { magicLinkTemplate } from '@/shared/services/email/templates/auth/magic-link';
import { payoutSent } from '@/shared/services/email/templates/onboarding/payout-sent';
import { practiceInvitation } from '@/shared/services/email/templates/team/practice-invitation';
import { stripeConnectStatus } from '@/shared/services/email/templates/onboarding/stripe-connect-status';
import { stripeConnectWelcome } from '@/shared/services/email/templates/onboarding/stripe-connect-welcome';
import { teamPaymentReceipt } from '@/shared/services/email/templates/team/payment-receipt';
import { teamPaymentRefundRequest } from '@/shared/services/email/templates/team/payment-refund-request';
import { teamPaymentRefunded } from '@/shared/services/email/templates/team/payment-refunded';
import { welcomeEmail } from '@/shared/services/email/templates/onboarding/welcome';
import { isProduction } from '@/shared/utils/env';
import { HttpStatus } from '@/shared/utils/result';

const http = new Hono<AppContext>();

const EMAILS_DIR = path.join(process.cwd(), 'storage', 'emails');

const denyInProduction = (c: Context): Response | undefined => {
  if (isProduction()) {
    return c.json({ error: 'Not available in production' }, HttpStatus.FORBIDDEN);
  }

  return undefined;
};

/**
 * List all saved emails
 */
http.get('/emails', async (c) => {
  const blocked = denyInProduction(c);
  if (blocked) {
    return blocked;
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
  const blocked = denyInProduction(c);
  if (blocked) {
    return blocked;
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
  supportEmail: 'help@blawby.com',
  supportUrl: 'https://blawby.com/help',
};

const sampleWelcomeData: WelcomeEmailData = {
  dashboardUrl: 'https://blawby.com/dashboard',
  recipientEmail: 'lawyer@example.com',
  recipientName: 'Sarah Johnson',
  supportUrl: 'https://blawby.com/help',
  tutorialUrl: 'https://blawby.com/tutorials/account-basics',
};

const sampleStripeConnectData: StripeConnectWelcomeData = {
  dashboardUrl: 'https://blawby.com/dashboard',
  recipientEmail: 'lawyer@example.com',
  recipientName: 'Sarah Johnson',
  supportUrl: 'https://blawby.com/help',
  tutorialUrl: 'https://blawby.com/tutorials/getting-started',
};

const samplePracticeInvitationData: PracticeInvitationData = {
  inviteLink: 'https://blawby.com/invite/abc123def456',
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
  invoicePDFUrl: 'https://blawby.com/invoices/INV-2026-001.pdf',
  supportEmail: 'help@blawby.com',
  supportUrl: 'https://blawby.com/help',
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
  invoiceUrl: 'https://blawby.com/dashboard/intakes/abc123',
  supportEmail: 'help@blawby.com',
  supportUrl: 'https://blawby.com/help',
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
  paymentLink: 'https://blawby.com/pay/INV-2026-002',
  supportEmail: 'help@blawby.com',
  supportUrl: 'https://blawby.com/help',
};

const sampleTeamPaymentReceiptData: TeamPaymentReceiptData = {
  amountPaid: 150000,
  businessName: 'Smith & Associates Law Firm',
  invoiceNumber: 'PAY-2026-001',
  invoiceUrl: 'https://blawby.com/invoices/PAY-2026-001',
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
  supportUrl: 'https://blawby.com/help',
};

const samplePayoutSentData: PayoutSentData = {
  businessName: 'Smith & Associates Law Firm',
  dashboardUrl: 'https://blawby.com/dashboard',
  recipientEmail: 'lawyer@example.com',
  recipientName: 'Sarah Johnson',
};

const sampleStripeConnectStatusData: StripeConnectStatusData = {
  dashboardUrl: 'https://blawby.com/dashboard',
  recipientEmail: 'lawyer@example.com',
  recipientName: 'Sarah Johnson',
  supportUrl: 'https://blawby.com/help',
  tutorialUrl: 'https://blawby.com/tutorials/getting-started',
};

/**
 * Email template preview page
 */
http.get('/email-templates', (c) => {
  const blocked = denyInProduction(c);
  if (blocked) {
    return blocked;
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
    .template-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
      gap: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .template-card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .template-header {
      background: #1a202c;
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
    .loading {
      text-align: center;
      padding: 40px;
      color: #666;
    }
    .section-title {
      grid-column: 1 / -1;
      text-align: center;
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
      font-size: 24px;
      font-weight: 700;
      color: #1a202c;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📧 Email Templates Preview</h1>
    <p>Review all email templates with the new premium design</p>
  </div>

  <div class="template-grid">
    <div class="section-title">Authentication</div>

    <div class="template-card">
      <div class="template-header">Sign in to Blawby</div>
      <div class="template-content">
        <div class="mobile-frame">
          <iframe src="/api/dev/email-templates/magic-link"></iframe>
        </div>
      </div>
    </div>

    <div class="section-title">Customer Emails</div>

    <div class="template-card">
      <div class="template-header">New invoice from Smith & Associates INV-2026-002</div>
      <div class="template-content">
        <div class="mobile-frame">
          <iframe src="/api/dev/email-templates/payment-request"></iframe>
        </div>
      </div>
    </div>

    <div class="template-card">
      <div class="template-header">Your receipt from Smith & Associates INV-2026-001</div>
      <div class="template-content">
        <div class="mobile-frame">
          <iframe src="/api/dev/email-templates/payment-receipt"></iframe>
        </div>
      </div>
    </div>

    <div class="template-card">
      <div class="template-header">Refund Request Received for INV-2026-001</div>
      <div class="template-content">
        <div class="mobile-frame">
          <iframe src="/api/dev/email-templates/customer-refund-request"></iframe>
        </div>
      </div>
    </div>

    <div class="template-card">
      <div class="template-header">Refund Processed for INV-2026-001</div>
      <div class="template-content">
        <div class="mobile-frame">
          <iframe src="/api/dev/email-templates/customer-refunded"></iframe>
        </div>
      </div>
    </div>

    <div class="template-card">
      <div class="template-header">Refund Request Not Approved for INV-2026-001</div>
      <div class="template-content">
        <div class="mobile-frame">
          <iframe src="/api/dev/email-templates/customer-refund-rejected"></iframe>
        </div>
      </div>
    </div>

    <div class="section-title">Team/Practice Emails</div>

    <div class="template-card">
      <div class="template-header">Payment of $1,500.00 received from John Doe</div>
      <div class="template-content">
        <div class="mobile-frame">
          <iframe src="/api/dev/email-templates/team-payment-receipt"></iframe>
        </div>
      </div>
    </div>

    <div class="template-card">
      <div class="template-header">Refund Request Received for $1,500.00</div>
      <div class="template-content">
        <div class="mobile-frame">
          <iframe src="/api/dev/email-templates/team-refund-request"></iframe>
        </div>
      </div>
    </div>

    <div class="template-card">
      <div class="template-header">Refund Processed for $1,500.00</div>
      <div class="template-content">
        <div class="mobile-frame">
          <iframe src="/api/dev/email-templates/team-refunded"></iframe>
        </div>
      </div>
    </div>

    <div class="template-card">
      <div class="template-header">You've been invited to join Smith & Associates on Blawby</div>
      <div class="template-content">
        <div class="mobile-frame">
          <iframe src="/api/dev/email-templates/practice-invitation"></iframe>
        </div>
      </div>
    </div>

    <div class="section-title">Onboarding Emails</div>

    <div class="template-card">
      <div class="template-header">Welcome to Blawby!</div>
      <div class="template-content">
        <div class="mobile-frame">
          <iframe src="/api/dev/email-templates/welcome"></iframe>
        </div>
      </div>
    </div>

    <div class="template-card">
      <div class="template-header">Your Stripe account is connected!</div>
      <div class="template-content">
        <div class="mobile-frame">
          <iframe src="/api/dev/email-templates/stripe-connect-welcome"></iframe>
        </div>
      </div>
    </div>

    <div class="template-card">
      <div class="template-header">Action required: Verify your account information</div>
      <div class="template-content">
        <div class="mobile-frame">
          <iframe src="/api/dev/email-templates/stripe-connect-status"></iframe>
        </div>
      </div>
    </div>

    <div class="template-card">
      <div class="template-header">A payout was sent to your bank account</div>
      <div class="template-content">
        <div class="mobile-frame">
          <iframe src="/api/dev/email-templates/payout-sent"></iframe>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
  `);
});

/**
 * Individual email template previews
 */
http.get('/email-templates/magic-link', (c) => {
  const blocked = denyInProduction(c);
  if (blocked) {
    return blocked;
  }
  const html = magicLinkTemplate(sampleMagicLinkData);
  return c.html(html);
});

http.get('/email-templates/payment-receipt', (c) => {
  const blocked = denyInProduction(c);
  if (blocked) {
    return blocked;
  }
  const html = customerPaymentReceipt(samplePaymentReceiptData);
  return c.html(html);
});

http.get('/email-templates/welcome', (c) => {
  const blocked = denyInProduction(c);
  if (blocked) {
    return blocked;
  }
  const html = welcomeEmail(sampleWelcomeData);
  return c.html(html);
});

http.get('/email-templates/stripe-connect-welcome', (c) => {
  const blocked = denyInProduction(c);
  if (blocked) {
    return blocked;
  }
  const html = stripeConnectWelcome(sampleStripeConnectData);
  return c.html(html);
});

http.get('/email-templates/practice-invitation', (c) => {
  const blocked = denyInProduction(c);
  if (blocked) {
    return blocked;
  }
  const html = practiceInvitation(samplePracticeInvitationData);
  return c.html(html);
});

http.get('/email-templates/payment-request', (c) => {
  const blocked = denyInProduction(c);
  if (blocked) {
    return blocked;
  }
  const html = customerPaymentRequest(samplePaymentRequestData);
  return c.html(html);
});

http.get('/email-templates/team-payment-receipt', (c) => {
  const blocked = denyInProduction(c);
  if (blocked) {
    return blocked;
  }
  const html = teamPaymentReceipt(sampleTeamPaymentReceiptData);
  return c.html(html);
});

// Customer refund templates
http.get('/email-templates/customer-refund-request', (c) => {
  const blocked = denyInProduction(c);
  if (blocked) {
    return blocked;
  }
  const html = customerPaymentRefundRequest(sampleRefundData);
  return c.html(html);
});

http.get('/email-templates/customer-refunded', (c) => {
  const blocked = denyInProduction(c);
  if (blocked) {
    return blocked;
  }
  const html = customerPaymentRefunded(sampleRefundData);
  return c.html(html);
});

http.get('/email-templates/customer-refund-rejected', (c) => {
  const blocked = denyInProduction(c);
  if (blocked) {
    return blocked;
  }
  const html = customerPaymentRefundRejected(sampleRefundData);
  return c.html(html);
});

// Team refund templates
http.get('/email-templates/team-refund-request', (c) => {
  const blocked = denyInProduction(c);
  if (blocked) {
    return blocked;
  }
  const html = teamPaymentRefundRequest(sampleTeamRefundData);
  return c.html(html);
});

http.get('/email-templates/team-refunded', (c) => {
  const blocked = denyInProduction(c);
  if (blocked) {
    return blocked;
  }
  const html = teamPaymentRefunded(sampleTeamRefundData);
  return c.html(html);
});

http.get('/email-templates/payout-sent', (c) => {
  const blocked = denyInProduction(c);
  if (blocked) {
    return blocked;
  }
  const html = payoutSent(samplePayoutSentData);
  return c.html(html);
});

http.get('/email-templates/stripe-connect-status', (c) => {
  const blocked = denyInProduction(c);
  if (blocked) {
    return blocked;
  }
  const html = stripeConnectStatus(sampleStripeConnectStatusData);
  return c.html(html);
});

export default http;
