/**
 * Team Payment Refunded Email Template
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

export const teamPaymentRefunded = (data: TeamPaymentReceiptData): string => {
  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="20px" font-weight="700" line-height="28px">
          Refund Processed
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500" padding-top="10px">
          A refund of ${formatCurrency(data.amountPaid)} has been processed for your customer.
        </mj-text>
      </mj-column>
    `)}

    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.text}" font-size="14px" font-weight="700">REFUND DETAILS</mj-text>
        <mj-table>
          <tr>
            <td style="padding-bottom: 16px; padding-top: 8px; font-size: 16px; font-weight: 500; color: #1a1a1a;">
              ${formatCurrency(data.amountPaid)} — Refunded
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
        
        <mj-text color="${COLORS.text}" font-size="14px" font-weight="700">REFUND METHOD</mj-text>
        <mj-text padding-top="8px">${data.paymentMethod ? escapeHtml(data.paymentMethod) : 'Original payment method'}</mj-text>
        <mj-divider border-color="${COLORS.border}" />
        
        <mj-text color="${COLORS.textMuted}">
          Questions? ${data.supportUrl ? `Visit <a href="${sanitizeUrl(data.supportUrl)}" style="color: #1a202c;">${escapeHtml(data.supportUrl)}</a> or ` : ''}
          Contact us at <a href="mailto:${escapeHtml(data.supportEmail)}" style="color: #1a202c;">${escapeHtml(data.supportEmail)}</a>.
        </mj-text>
        
        <mj-text color="${COLORS.text}" font-size="16px" font-weight="500" padding-top="20px">
          Review this refund in your dashboard for your records.
        </mj-text>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL
  );

  return renderMjml(mjmlContent);
};
