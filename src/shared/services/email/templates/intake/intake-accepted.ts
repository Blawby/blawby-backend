import type { IntakeAcceptedData } from '@/shared/services/email/email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  escapeHtml,
  COLORS,
  BLAWBY_LOGO_URL,
} from '@/shared/services/email/templates/base.template';

/**
 * Prospect-facing: "Your case has been accepted"
 */
export const intakeAccepted = (data: IntakeAcceptedData): string => {
  const recipientName = escapeHtml(data.recipientName || 'there');
  const practiceName = escapeHtml(data.practiceName);

  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="20px" font-weight="700" padding-bottom="10px">
          Your Case Has Been Accepted
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          Hello ${recipientName},
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          Great news! <strong>${practiceName}</strong> has reviewed your submission and has accepted your case.
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          A member of the team will be in touch with you soon to discuss next steps.
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
