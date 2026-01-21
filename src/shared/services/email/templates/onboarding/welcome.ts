/**
 * Welcome Email Template
 */

import type { WelcomeEmailData } from '../../email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  sanitizeUrl,
  COLORS,
  BLAWBY_LOGO_URL,
} from '../base.template';

export const welcomeEmail = (data: WelcomeEmailData): string => {
  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500">
          Thanks for signing up for Blawby! You're now ready to connect your bank account to Blawby to receive payouts. Blawby partners with Stripe for secure payments.
        </mj-text>
        <mj-button href="${sanitizeUrl(data.dashboardUrl)}">
          Connect Bank Account
        </mj-button>
        <mj-divider border-color="${COLORS.border}" padding="30px 0" />
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500">
          If you would like to build an integration, you might find our <a href="https://blawby.com/docs" style="color: #000000;">documentation</a> handy.
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500" padding-top="10px">
          Once your account is connected you will be able to <a href="${sanitizeUrl(data.tutorialUrl)}" style="color: #000000;">add a client</a> and send invoices. You might find our tutorial on <a href="${sanitizeUrl(data.tutorialUrl)}" style="color: #000000;">account basics</a> useful.
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500" padding-top="10px">
          We'll be here to help with any step along the way. You can find answers to most questions and get in touch with us on our <a href="${sanitizeUrl(data.supportUrl)}" style="color: #000000;">support site</a>.
        </mj-text>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL,
  );

  return renderMjml(mjmlContent);
};
