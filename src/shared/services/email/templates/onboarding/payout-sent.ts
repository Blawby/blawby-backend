/**
 * Payout Sent Email Template
 */

import type { PayoutSentData } from '../../email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  COLORS,
  BLAWBY_LOGO_URL,
} from '../base.template';

export const payoutSent = (data: PayoutSentData): string => {
  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500">
          A payout for ${data.businessName} was sent.
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500" padding-top="10px">
          The payout will be deposited via Bank account within 1 - 7 business days.
        </mj-text>
        <mj-button href="${data.dashboardUrl}">
          View payout
        </mj-button>
        <mj-divider border-color="${COLORS.border}" padding="30px 0" />
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500">
          Learn more about <a href="https://blawby.com/docs/payouts.html" style="color: #000000;">payouts</a>.
        </mj-text>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL,
  );

  return renderMjml(mjmlContent);
};
