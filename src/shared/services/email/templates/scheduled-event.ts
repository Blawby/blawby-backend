/**
 * Scheduled Event Email Template
 */

import type { ScheduledEventData } from '@/shared/services/email/email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  escapeHtml,
  sanitizeUrl,
  COLORS,
  BLAWBY_LOGO_URL,
} from '@/shared/services/email/templates/base.template';

export const scheduledEventTemplate = (data: ScheduledEventData): string => {
  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500">
          You have scheduled a consultation with ${escapeHtml(data.teamName)} team!
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500" padding-top="10px">
          Please pay for your consultation before the meeting. Click the button below to proceed with the payment:
        </mj-text>
        <mj-button href="${sanitizeUrl(data.paymentUrl)}">
          Pay Now
        </mj-button>
        <mj-divider border-color="${COLORS.border}" padding="30px 0" />
        <mj-text font-size="14px" color="${COLORS.textMuted}">
          If you did not expect to receive this email, you may disregard it.
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="14px" padding-top="10px">
          Payments by Blawby
        </mj-text>
        <mj-divider border-color="${COLORS.border}" padding="20px 0" />
        <mj-text color="${COLORS.textMuted}" font-size="14px">
          Questions? Visit <a href="${sanitizeUrl(data.supportUrl)}" style="color: #000000;">help & support</a>.
        </mj-text>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL,
  );

  return renderMjml(mjmlContent);
};
