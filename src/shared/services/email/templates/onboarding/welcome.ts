/**
 * Welcome Email Template
 */

import type { WelcomeEmailData } from '@/shared/services/email/email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  sanitizeUrl,
  COLORS,
  BLAWBY_LOGO_URL,
} from '@/shared/services/email/templates/base.template';
import { config } from '@/shared/config';

const FRONTEND_URLS = {
  DOCS: `${config.app.appUrl}/docs`,
  HELP: `${config.app.appUrl}/help`,
};

export const welcomeEmail = (data: WelcomeEmailData): string => {
  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500">
          Thanks for signing up for Blawby! You're now ready to connect your bank account to Blawby to receive payouts. Blawby partners with Stripe for secure payments.
        </mj-text>
        <mj-button href="${sanitizeUrl(data.payoutsUrl || data.dashboardUrl)}">
          Connect Bank Account
        </mj-button>
        <mj-divider border-color="${COLORS.border}" padding="30px 0" />
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500">
          If you would like to build an integration, you might find our <a href="${sanitizeUrl(FRONTEND_URLS.DOCS)}" style="color: #1a202c;">documentation</a> handy.
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500" padding-top="10px">
          Once you're ready to start accepting live payments, simply <a href="${sanitizeUrl(data.practiceDashboardUrl || data.dashboardUrl)}" style="color: #1a202c;">add a client</a>.
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500" padding-top="10px">
          We'll be here to help with any step along the way. You can find answers to most questions and get in touch with us on our <a href="${sanitizeUrl(FRONTEND_URLS.HELP)}" style="color: #1a202c;">help site</a>.
        </mj-text>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL
  );

  return renderMjml(mjmlContent);
};
