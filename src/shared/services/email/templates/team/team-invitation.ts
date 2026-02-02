/**
 * Team Invitation Email Template
 */

import { type TeamInvitationData } from '../../email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  sanitizeUrl,
  COLORS,
  BLAWBY_LOGO_URL,
} from '../base.template';

/**
 * Renders an invitation email for a user to join an organization.
 * Uses the TeamInvitationData structure: { recipientEmail, recipientName, inviterName, teamName, inviteLink }
 */
export const teamInvitation = (data: TeamInvitationData): string => {
  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="20px" font-weight="700" padding-bottom="10px">
          You've been invited to join ${data.teamName} on Blawby
        </mj-text>
        
        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          Hello ${data.recipientName || 'there'},
        </mj-text>
        
        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          <strong>${data.inviterName}</strong> has invited you to join their team, <strong>${data.teamName}</strong>, on Blawby.
        </mj-text>
        
        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px" padding-bottom="20px">
          Blawby helps teams manage legal practices, client intakes, and payments effortlessly. Join your team to get started.
        </mj-text>
        
        <mj-button href="${sanitizeUrl(data.inviteLink)}">
          Accept Invitation
        </mj-button>
        
        <mj-divider border-color="${COLORS.border}" padding="30px 0" />
        
        <mj-text color="${COLORS.subtext}" font-size="14px" line-height="20px">
          If the button above doesn't work, copy and paste this link into your browser:
        </mj-text>
        
        <mj-text color="${COLORS.primary}" font-size="12px" line-height="16px" padding-top="5px">
          <a href="${sanitizeUrl(data.inviteLink)}" style="color: ${COLORS.primary}; word-break: break-all;">
            ${data.inviteLink}
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
