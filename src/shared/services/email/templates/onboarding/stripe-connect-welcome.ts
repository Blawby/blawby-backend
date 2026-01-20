/**
 * Stripe Connect Welcome Email Template
 */

import type { StripeConnectWelcomeData } from '../../email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  COLORS,
  BLAWBY_LOGO_URL,
} from '../base.template';

export const stripeConnectWelcome = (data: StripeConnectWelcomeData): string => {
  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500">
          Thanks for submitting your account information! You're now ready to make live transactions with Blawby. We will reach out if we need additional information.
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500" padding-top="10px">
          You can view your payments and a variety of other information about your account directly from your dashboard:
        </mj-text>
        <mj-button href="${data.dashboardUrl}">
          View Your Blawby Dashboard
        </mj-button>
        <mj-divider border-color="${COLORS.border}" />
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500">
          If you would like to build an integration, you might find our <a href="https://blawby.com/docs" style="color: #000000;">docs</a> handy.
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500" padding-top="10px">
          Once you're ready to start accepting live payments, simply <a href="${data.tutorialUrl}" style="color: #000000;">add a client</a> and send an invoice. You might find our tutorial on <a href="${data.tutorialUrl}" style="color: #000000;">account basics</a> useful.
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500" padding-top="10px">
          We'll be here to help with any step along the way. You can find answers to most questions and get in touch with us on our <a href="${data.supportUrl}" style="color: #000000;">support site</a>.
        </mj-text>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL,
  );

  return renderMjml(mjmlContent);
};
