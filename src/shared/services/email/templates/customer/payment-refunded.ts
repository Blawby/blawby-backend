/**
 * Customer Payment Refunded Email Template
 */

import type { CustomerPaymentReceiptData } from '@/shared/services/email/email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  formatCurrency,
  escapeHtml,
  sanitizeUrl,
  COLORS,
  INVOICE_ILLUSTRATION_URL,
} from '@/shared/services/email/templates/base.template';

export const customerPaymentRefunded = (data: CustomerPaymentReceiptData): string => {
  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-table>
        <tr>
          <td width="70%" valign="middle" align="left" style="padding: 0 16px;">
            <div>
              <div style="color: #6b7280; font-size: 16px; font-weight: 500; margin-bottom: 5px;">Refund Processed</div>
              <div style="color: #1a1a1a; font-size: 38px; font-weight: 600; line-height: 42px; margin-bottom: 5px;">${formatCurrency(data.amountPaid)}</div>
              <div style="color: #6b7280; font-size: 16px; font-weight: 500;">Invoice #${escapeHtml(data.invoiceNumber)}</div>
            </div>
          </td>
          <td width="30%" valign="middle" align="right" style="padding: 0 16px;">
            <img src="${INVOICE_ILLUSTRATION_URL}" alt="Refund Processed" width="94" style="border-radius: 8px;" />
          </td>
        </tr>
      </mj-table>
    `)}

    ${cardSection(`
      <mj-column>
        <mj-divider border-color="${COLORS.border}" />
        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px">
          Hello ${escapeHtml(data.recipientName)},
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px" padding-top="10px">
          Good news! Your refund of ${formatCurrency(data.amountPaid)} for invoice #${escapeHtml(data.invoiceNumber)} has been processed.
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px" padding-top="10px">
          The refund has been issued to your original payment method and should appear in your account within 3-5 business days, depending on your bank's processing time.
        </mj-text>
        <mj-divider border-color="${COLORS.border}" padding="20px 0" />
        <mj-text color="${COLORS.textMuted}" font-size="14px">
          Questions? ${data.supportUrl ? `Visit <a href="${sanitizeUrl(data.supportUrl)}" style="color: #1a202c;">${escapeHtml(data.supportUrl)}</a> or ` : ''}
          Contact us at <a href="mailto:${escapeHtml(data.supportEmail)}" style="color: #1a202c;">${escapeHtml(data.supportEmail)}</a>.
        </mj-text>
      </mj-column>
    `)}
  `,
    data.teamPhotoUrl,
  );

  return renderMjml(mjmlContent);
};
