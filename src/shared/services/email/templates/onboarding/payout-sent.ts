/**
 * Payout Sent Email Template
 */

import type { PayoutSentData } from '@/shared/services/email/email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  escapeHtml,
  sanitizeUrl,
  COLORS,
  BLAWBY_LOGO_URL,
} from '@/shared/services/email/templates/base.template';
import { FRONTEND_URLS } from '@/shared/utils/urls';

export const payoutSent = (data: PayoutSentData): string => {
  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500">
          A payout for ${escapeHtml(data.businessName)} was sent.
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500" padding-top="10px">
          The payout will be deposited via Bank account within 1 - 7 business days.
        </mj-text>
        <mj-button href="${sanitizeUrl(`${data.dashboardUrl}/settings/account/payouts`)}">
          View payout
        </mj-button>
        <mj-divider border-color="${COLORS.border}" padding="30px 0" />
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500">
          Learn more about <a href="${sanitizeUrl(FRONTEND_URLS.PAYOUTS)}" style="color: #1a202c;">payouts</a>.
        </mj-text>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL
  );

  return renderMjml(mjmlContent);
};
