import type { MatterOpenedData } from '@/shared/services/email/email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  escapeHtml,
  sanitizeUrl,
  COLORS,
  BLAWBY_LOGO_URL,
} from '@/shared/services/email/templates/base.template';

/**
 * Client-facing: "Your matter has been opened"
 */
export const matterOpened = (data: MatterOpenedData): string => {
  const recipientName = escapeHtml(data.recipientName || 'there');
  const matterTitle = escapeHtml(data.matterTitle);
  const practiceName = escapeHtml(data.practiceName);
  const sanitizedDashboardUrl = sanitizeUrl(data.dashboardUrl);

  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="20px" font-weight="700" padding-bottom="10px">
          Your Matter Has Been Opened
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          Hello ${recipientName},
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          <strong>${practiceName}</strong> has opened a matter on your behalf:
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="18px" font-weight="600" line-height="24px" padding-bottom="20px">
          ${matterTitle}
        </mj-text>

        <mj-button href="${sanitizedDashboardUrl}">
          View Your Matter
        </mj-button>

        <mj-divider border-color="${COLORS.border}" padding="30px 0" />

        <mj-text color="${COLORS.textMuted}" font-size="14px" line-height="20px">
          If you have any questions about your matter, please contact <strong>${practiceName}</strong> directly.
        </mj-text>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL
  );

  return renderMjml(mjmlContent);
};
