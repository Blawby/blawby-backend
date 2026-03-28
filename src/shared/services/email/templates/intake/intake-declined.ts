import type { IntakeDeclinedData } from '@/shared/services/email/email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  escapeHtml,
  COLORS,
  BLAWBY_LOGO_URL,
} from '@/shared/services/email/templates/base.template';

/**
 * Prospect-facing: "Your case has been declined"
 */
export const intakeDeclined = (data: IntakeDeclinedData): string => {
  const recipientName = escapeHtml(data.recipientName || 'there');
  const practiceName = escapeHtml(data.practiceName);

  const reasonSection = data.reason
    ? `
        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          <strong>Reason:</strong> ${escapeHtml(data.reason)}
        </mj-text>
      `
    : '';

  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="20px" font-weight="700" padding-bottom="10px">
          Update on Your Submission
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          Hello ${recipientName},
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          After reviewing your submission, <strong>${practiceName}</strong> is unfortunately unable to assist with your case at this time.
        </mj-text>

        ${reasonSection}

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          We encourage you to seek assistance from another legal professional who may be better suited to help with your matter.
        </mj-text>

        <mj-divider border-color="${COLORS.border}" padding="30px 0" />

        <mj-text color="${COLORS.textMuted}" font-size="14px" line-height="20px">
          If you have any questions, please contact <strong>${practiceName}</strong> directly.
        </mj-text>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL
  );

  return renderMjml(mjmlContent);
};
