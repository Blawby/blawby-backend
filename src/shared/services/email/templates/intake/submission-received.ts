import type { IntakeSubmissionReceivedData } from '@/shared/services/email/email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  escapeHtml,
  COLORS,
  BLAWBY_LOGO_URL,
} from '@/shared/services/email/templates/base.template';

/**
 * Prospect-facing: "Your submission has been received"
 */
export const intakeSubmissionReceived = (data: IntakeSubmissionReceivedData): string => {
  const recipientName = escapeHtml(data.recipientName || 'there');
  const practiceName = escapeHtml(data.practiceName);

  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="20px" font-weight="700" padding-bottom="10px">
          Submission Received
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          Hello ${recipientName},
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          Thank you for submitting your information to <strong>${practiceName}</strong>. Your submission has been received and is now under review.
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          A member of the team will review your submission and follow up with you shortly.
        </mj-text>

        <mj-divider border-color="${COLORS.border}" padding="30px 0" />

        <mj-text color="${COLORS.textMuted}" font-size="14px" line-height="20px">
          If you have any questions in the meantime, please contact <strong>${practiceName}</strong> directly.
        </mj-text>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL
  );

  return renderMjml(mjmlContent);
};
