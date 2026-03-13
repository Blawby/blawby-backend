/**
 * Customer Payment Refund Rejected Email Template
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

export const customerPaymentRefundRejected = (data: CustomerPaymentReceiptData): string => {
  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-table>
        <tr>
          <td width="70%" valign="middle" align="left" style="padding: 0 16px;">
            <div>
              <div style="color: #6b7280; font-size: 16px; font-weight: 500; margin-bottom: 5px;">Refund Request Status</div>
              <div style="color: #1a1a1a; font-size: 38px; font-weight: 600; line-height: 42px; margin-bottom: 5px;">Request Not Approved</div>
              <div style="color: #6b7280; font-size: 16px; font-weight: 500;">Invoice #${escapeHtml(data.invoiceNumber)}</div>
            </div>
          </td>
          <td width="30%" valign="middle" align="right" style="padding: 0 16px;">
            <img src="${INVOICE_ILLUSTRATION_URL}" alt="Refund Request Status" width="94" style="border-radius: 8px;" />
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
          After careful review, ${escapeHtml(data.businessName)} has decided not to approve your refund request for ${formatCurrency(data.amountPaid)} related to invoice #${escapeHtml(data.invoiceNumber)}.
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px" padding-top="10px">
          If you have questions about this decision or would like to discuss alternative options, please contact ${escapeHtml(data.businessName)} directly.
        </mj-text>
        <mj-divider border-color="${COLORS.border}" padding="20px 0" />
        <mj-text color="${COLORS.textMuted}" font-size="14px">
          Questions? ${data.supportUrl ? `Visit <a href="${sanitizeUrl(data.supportUrl)}" style="color: #1a202c;">${escapeHtml(data.supportUrl)}</a> or ` : ''}
          ${data.supportEmail ? `Contact us at <a href="mailto:${escapeHtml(data.supportEmail)}" style="color: #1a202c;">${escapeHtml(data.supportEmail)}</a>.` : ''}
        </mj-text>
      </mj-column>
    `)}
  `,
    data.teamPhotoUrl
  );

  return renderMjml(mjmlContent);
};
