import type { ConflictCheckReviewRequiredData } from '@/shared/services/email/email.types';
import {
  BLAWBY_LOGO_URL,
  COLORS,
  baseLayout,
  cardSection,
  escapeHtml,
  renderMjml,
  sanitizeUrl,
} from '@/shared/services/email/templates/base.template';

export const conflictCheckReviewRequired = (data: ConflictCheckReviewRequiredData): string => {
  const recipientName = escapeHtml(data.recipientName || 'there');
  const practiceName = escapeHtml(data.practiceName);
  const matterId = escapeHtml(data.matterId);
  const resultStatus = escapeHtml(data.resultStatus);
  const reviewUrl = sanitizeUrl(data.reviewUrl);

  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="20px" font-weight="700" padding-bottom="10px">
          Conflict Check Requires Review
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          Hello ${recipientName},
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          A conflict check for ${practiceName} returned <strong>${resultStatus}</strong>.
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          Matter ID: ${matterId}
        </mj-text>

        <mj-button href="${reviewUrl}">
          Review Conflict Check
        </mj-button>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL
  );

  return renderMjml(mjmlContent);
};
