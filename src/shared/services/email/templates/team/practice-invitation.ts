import { type PracticeInvitationData } from '@/shared/services/email/email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  sanitizeUrl,
  escapeHtml,
  COLORS,
  BLAWBY_LOGO_URL,
} from '@/shared/services/email/templates/base.template';

/**
 * Renders an invitation email for a user to join an organization.
 * Uses the PracticeInvitationData structure: { recipientEmail, recipientName, inviterName, practiceName, inviteLink }
 */
export const practiceInvitation = (data: PracticeInvitationData): string => {
  const recipientName = escapeHtml(data.recipientName || 'there');
  const inviterName = escapeHtml(data.inviterName);
  const practiceName = escapeHtml(data.practiceName);
  const sanitizedInviteLink = sanitizeUrl(data.inviteLink);
  const escapedInviteLink = escapeHtml(sanitizedInviteLink);

  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="20px" font-weight="700" padding-bottom="10px">
          You've been invited to join ${practiceName} on Blawby
        </mj-text>
        
        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          Hello ${recipientName},
        </mj-text>
        
        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          <strong>${inviterName}</strong> has invited you to join their practice, <strong>${practiceName}</strong>, on Blawby.
        </mj-text>
        
        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px" padding-bottom="20px">
          Blawby helps teams manage legal practices, client intakes, and payments effortlessly. Join your team to get started.
        </mj-text>
        
        <mj-button href="${sanitizedInviteLink}">
          Accept Invitation
        </mj-button>
        
        <mj-divider border-color="${COLORS.border}" padding="30px 0" />
        
        <mj-text color="${COLORS.subtext}" font-size="14px" line-height="20px">
          If the button above doesn't work, copy and paste this link into your browser:
        </mj-text>
        
        <mj-text color="${COLORS.primary}" font-size="12px" line-height="16px" padding-top="5px">
          <a href="${sanitizedInviteLink}" style="color: ${COLORS.primary}; word-break: break-all;">
            ${escapedInviteLink}
          </a>
        </mj-text>
        
        <mj-text color="${COLORS.subtext}" font-size="14px" padding-top="20px">
          If you weren't expecting this invitation, you can safely ignore this email.
        </mj-text>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL,
  );

  return renderMjml(mjmlContent);
};
