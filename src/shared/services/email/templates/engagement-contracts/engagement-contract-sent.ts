import type { EngagementContractSentData } from '@/shared/services/email/email.types';
import {
  BLAWBY_LOGO_URL,
  COLORS,
  baseLayout,
  cardSection,
  escapeHtml,
  renderMjml,
  sanitizeUrl,
} from '@/shared/services/email/templates/base.template';

export const engagementContractSent = (data: EngagementContractSentData): string => {
  const recipientName = escapeHtml(data.recipientName || 'there');
  const matterTitle = escapeHtml(data.matterTitle);
  const practiceName = escapeHtml(data.practiceName);
  const reviewUrl = sanitizeUrl(data.reviewUrl);

  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="20px" font-weight="700" padding-bottom="10px">
          Your Engagement Contract Is Ready
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          Hello ${recipientName},
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          <strong>${practiceName}</strong> has sent your engagement contract for:
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="18px" font-weight="600" line-height="24px" padding-bottom="20px">
          ${matterTitle}
        </mj-text>

        ${reviewUrl !== '#' ? `<mj-button href="${reviewUrl}">Review Contract</mj-button>` : '<mj-text color="${COLORS.textMuted}" font-size="14px">Contract review link unavailable. Please contact the practice directly.</mj-text>'}
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL
  );

  return renderMjml(mjmlContent);
};
