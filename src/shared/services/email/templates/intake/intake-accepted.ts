import type { IntakeAcceptedData } from '@/shared/services/email/email.types';
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
 * Prospect-facing: "Your case has been accepted"
 */
export const intakeAccepted = async (data: IntakeAcceptedData): Promise<string> => {
  const recipientName = escapeHtml(data.recipientName || 'there');
  const practiceName = escapeHtml(data.practiceName);
  const magicLinkUrl = sanitizeUrl(data.magicLinkUrl);
  if (magicLinkUrl === '#') {
    throw new Error('A valid magic link URL is required for an accepted intake email');
  }

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
          Your next step is to create or access your secure account and speak with your legal team.
        </mj-text>

        <mj-button href="${escapeHtml(magicLinkUrl)}">
          Create Account &amp; Speak With Your Lawyer
        </mj-button>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          Your account lets you securely communicate with your legal team, share files, and follow the progress of your matter.
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
