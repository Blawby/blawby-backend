/**
 * Stripe Connect Status Email Template (KYC/Verification Required)
 */

import type { StripeConnectStatusData } from '@/shared/services/email/email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  escapeHtml,
  sanitizeUrl,
  COLORS,
  BLAWBY_LOGO_URL,
} from '@/shared/services/email/templates/base.template';
import { config } from '@/shared/config';

const FRONTEND_URLS = {
  DOCS: `${config.app.appUrl}/docs`,
};

export const stripeConnectStatus = (data: StripeConnectStatusData): string => {
  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500">
          We need to verify that your business information is accurate so you can continue processing payments and receiving payouts. We partner with Stripe for secure payments, and verifying your account with Stripe helps confirm and protect your identity.
        </mj-text>
        <mj-button href="${sanitizeUrl(data.payoutsUrl || data.dashboardUrl)}">
          Update Account Information
        </mj-button>
        <mj-divider border-color="${COLORS.border}" />
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500">
          If you would like to build an integration, you might find our <a href="${sanitizeUrl(FRONTEND_URLS.DOCS)}" style="color: #1a202c;">documentation</a> handy.
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500" padding-top="10px">
          Once you're ready to start accepting live payments, simply <a href="${sanitizeUrl(data.tutorialUrl)}" style="color: #1a202c;">add a client</a> and send an invoice. You might find our tutorial on <a href="${sanitizeUrl(data.tutorialUrl)}" style="color: #1a202c;">account basics</a> useful.
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500" padding-top="10px">
          We'll be here to help with any step along the way. You can find answers to most questions and get in touch with us on our <a href="${sanitizeUrl(data.supportUrl)}" style="color: #1a202c;">support site</a>.
        </mj-text>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL
  );

  return renderMjml(mjmlContent);
};
