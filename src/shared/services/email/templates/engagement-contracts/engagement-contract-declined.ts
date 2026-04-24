import type { EngagementContractDeclinedData } from '@/shared/services/email/email.types';
import {
  BLAWBY_LOGO_URL,
  COLORS,
  baseLayout,
  cardSection,
  escapeHtml,
  renderMjml,
} from '@/shared/services/email/templates/base.template';

export const engagementContractDeclined = (data: EngagementContractDeclinedData): string => {
  const recipientName = escapeHtml(data.recipientName || 'there');
  const matterTitle = escapeHtml(data.matterTitle);
  const practiceName = escapeHtml(data.practiceName);
  const clientName = escapeHtml(data.clientName);

  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="20px" font-weight="700" padding-bottom="10px">
          Engagement Contract Declined
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          Hello ${recipientName},
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          ${clientName} declined the engagement contract for <strong>${matterTitle}</strong>.
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          Practice: ${practiceName}
        </mj-text>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL
  );

  return renderMjml(mjmlContent);
};
