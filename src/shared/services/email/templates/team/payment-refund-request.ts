/**
 * Team Payment Refund Request Email Template
 */

import type { TeamPaymentReceiptData } from '@/shared/services/email/email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  formatCurrency,
  escapeHtml,
  sanitizeUrl,
  COLORS,
  BLAWBY_LOGO_URL,
} from '@/shared/services/email/templates/base.template';

export const teamPaymentRefundRequest = (data: TeamPaymentReceiptData): string => {
  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="20px" font-weight="700" line-height="28px">
          Refund Request Received
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500" padding-top="10px">
          A customer has requested a refund for ${formatCurrency(data.amountPaid)}.
        </mj-text>
      </mj-column>
    `)}

    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="14px" font-weight="700">REFUND DETAILS</mj-text>
        <mj-table>
          <tr>
            <td style="padding-bottom: 16px; padding-top: 8px; font-size: 16px; font-weight: 500; color: #1a1a1a;">
              ${formatCurrency(data.amountPaid)} — Refund Requested
            </td>
          </tr>
        </mj-table>
        <mj-divider border-color="${COLORS.border}" />
        
        <mj-text color="${COLORS.text}" font-size="14px" font-weight="700">CLIENT NAME</mj-text>
        <mj-text padding-top="8px">${escapeHtml(data.recipientName)}</mj-text>
        <mj-divider border-color="${COLORS.border}" />
        
        <mj-text color="${COLORS.text}" font-size="14px" font-weight="700">CLIENT EMAIL</mj-text>
        <mj-text padding-top="8px">${data.recipientEmail ? escapeHtml(data.recipientEmail) : 'Not provided'}</mj-text>
        <mj-divider border-color="${COLORS.border}" />
        
        <mj-text color="${COLORS.text}" font-size="14px" font-weight="700">PAYMENT ID</mj-text>
        <mj-text padding-top="8px">${escapeHtml(data.invoiceNumber)}</mj-text>
        <mj-divider border-color="${COLORS.border}" />
        
        <mj-text color="${COLORS.text}" font-size="14px" font-weight="700">ORIGINAL PAYMENT METHOD</mj-text>
        <mj-text padding-top="8px">${data.paymentMethod ? escapeHtml(data.paymentMethod) : 'Not specified'}</mj-text>
        <mj-divider border-color="${COLORS.border}" />
        
        <mj-text color="${COLORS.textMuted}">
          Questions? ${data.supportUrl ? `Visit <a href="${sanitizeUrl(data.supportUrl)}" style="color: #1a202c;">${escapeHtml(data.supportUrl)}</a> or ` : ''}
          Contact us at <a href="mailto:${escapeHtml(data.supportEmail)}" style="color: #1a202c;">${escapeHtml(data.supportEmail)}</a>.
        </mj-text>
        
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500" padding-top="20px">
          Review this refund request in your dashboard to take appropriate action.
        </mj-text>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL,
  );

  return renderMjml(mjmlContent);
};
