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
 * Enhanced with decision-making data while following established design system
 */
export const intakeNewNotification = (data: IntakeNewNotificationData): string => {
  const recipientName = escapeHtml(data.recipientName || 'there');
  const clientName = escapeHtml(data.clientName);
  const clientEmail = escapeHtml(data.clientEmail);
  const practiceName = escapeHtml(data.practiceName);
  const formattedAmount = data.amount > 0 ? formatCurrency(data.amount) : 'Free';

  // Format case strength
  const caseStrengthDisplay =
    data.caseStrength !== null && data.caseStrength !== undefined
      ? `${Math.round(data.caseStrength * 100)}%`
      : 'Not assessed';

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
          ${clientName} submitted a new intake for review.
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          <strong>Practice:</strong> ${practiceName}<br />
          <strong>Client email:</strong> ${clientEmail}<br />
          <strong>Estimated fee:</strong> ${formattedAmount}
        </mj-text>

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          <a href="${sanitizeUrl(data.intakeUrl)}" style="color: ${COLORS.text}; text-decoration: underline;">New Intake for: ${escapeHtml(data.matterType || 'General inquiry')} — ${clientName}</a>
        </mj-text>

        ${
          data.description
            ? `
        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          ${escapeHtml(data.description)}
        </mj-text>
        `
            : ''
        }

        ${
          data.desiredOutcome
            ? `
        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          <strong>Desired Outcome:</strong> ${escapeHtml(data.desiredOutcome)}
        </mj-text>
        `
            : ''
        }

        ${
          data.opposingParty
            ? `
        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          <strong>Opposing Party:</strong> ${escapeHtml(data.opposingParty)}
        </mj-text>
        `
            : ''
        }

        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          <strong>Case strength:</strong> ${escapeHtml(caseStrengthDisplay)}${
            data.jurisdiction ? `<br /><strong>Jurisdiction:</strong> ${escapeHtml(data.jurisdiction)}` : ''
          }${data.courtDate ? `<br /><strong>Court date:</strong> ${escapeHtml(data.courtDate)}` : ''}${
            data.hasDocuments !== undefined
              ? `<br /><strong>Documents attached:</strong> ${data.hasDocuments ? 'Yes' : 'No'}`
              : ''
          }${data.submittedAt ? `<br /><strong>Submitted:</strong> ${escapeHtml(data.submittedAt)}` : ''}
        </mj-text>

        ${
          data.acceptUrl
            ? `
        <mj-button href="${sanitizeUrl(data.acceptUrl)}">
          Accept Intake
        </mj-button>
        `
            : ''
        }

        ${
          data.declineUrl
            ? `
        <mj-button
          href="${sanitizeUrl(data.declineUrl)}"
          background-color="${COLORS.white}"
          color="${COLORS.text}"
          border="1px solid ${COLORS.border}"
        >
          Decline
        </mj-button>
        `
            : ''
        }
      </mj-column>
    `)}
    `,
    BLAWBY_LOGO_URL
  );

  return renderMjml(mjmlContent);
};
