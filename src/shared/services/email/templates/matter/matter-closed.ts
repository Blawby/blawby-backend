import type { MatterClosedData } from '@/shared/services/email/email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  escapeHtml,
  COLORS,
  BLAWBY_LOGO_URL,
} from '@/shared/services/email/templates/base.template';

/**
 * Client-facing: "Your matter has been closed"
 */
export const matterClosed = (data: MatterClosedData): string => {
  const recipientName = escapeHtml(data.recipientName || 'there');
  const matterTitle = escapeHtml(data.matterTitle);
  const practiceName = escapeHtml(data.practiceName);

  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="20px" font-weight="700" padding-bottom="10px">
          Your Matter Has Been Closed
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          Hello ${recipientName},
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          <strong>${practiceName}</strong> has closed the following matter:
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="18px" font-weight="600" line-height="24px">
          ${matterTitle}
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          If you have any questions or need further assistance, please don't hesitate to reach out.
        </mj-text>

        <mj-divider border-color="${COLORS.border}" padding="30px 0" />

        <mj-text color="${COLORS.textMuted}" font-size="14px" line-height="20px">
          If you believe this matter was closed in error, please contact <strong>${practiceName}</strong> directly.
        </mj-text>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL
  );

  return renderMjml(mjmlContent);
};
