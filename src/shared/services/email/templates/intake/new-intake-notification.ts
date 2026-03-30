import type { IntakeNewNotificationData } from '@/shared/services/email/email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  escapeHtml,
  sanitizeUrl,
  formatCurrency,
  COLORS,
  BLAWBY_LOGO_URL,
} from '@/shared/services/email/templates/base.template';

/**
 * Practice-facing: "You've received a new intake submission"
 */
export const intakeNewNotification = (data: IntakeNewNotificationData): string => {
  const recipientName = escapeHtml(data.recipientName || 'there');
  const clientName = escapeHtml(data.clientName);
  const clientEmail = escapeHtml(data.clientEmail);
  const practiceName = escapeHtml(data.practiceName);
  const sanitizedIntakeUrl = sanitizeUrl(data.intakeUrl);
  const formattedAmount = data.amount > 0 ? formatCurrency(data.amount) : 'No fee';

  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="20px" font-weight="700" padding-bottom="10px">
          New Intake Submission
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          Hello ${recipientName},
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          You've received a new intake submission from <strong>${clientName}</strong> (${clientEmail}).
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          <strong>Amount:</strong> ${formattedAmount}
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px" padding-bottom="20px">
          Please review and triage this intake at your earliest convenience.
        </mj-text>

        <mj-button href="${sanitizedIntakeUrl}">
          Review Intake
        </mj-button>

        <mj-divider border-color="${COLORS.border}" padding="30px 0" />

        <mj-text color="${COLORS.textMuted}" font-size="14px" line-height="20px">
          This notification was sent to you as the owner of <strong>${practiceName}</strong>.
        </mj-text>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL
  );

  return renderMjml(mjmlContent);
};
