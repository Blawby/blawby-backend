/**
 * Customer Payment Refund Request Email Template
 */

import type { CustomerPaymentReceiptData } from '../../email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  formatCurrency,
  escapeHtml,
  sanitizeUrl,
  COLORS,
  INVOICE_ILLUSTRATION_URL,
} from '../base.template';

export const customerPaymentRefundRequest = (data: CustomerPaymentReceiptData): string => {
  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-table>
        <tr>
          <td width="70%" valign="middle" align="left" style="padding: 0 16px;">
            <div>
              <div style="color: #6b7280; font-size: 16px; font-weight: 500; margin-bottom: 5px;">Refund Request for ${escapeHtml(data.businessName)}</div>
              <div style="color: #1a1a1a; font-size: 38px; font-weight: 600; line-height: 42px; margin-bottom: 5px;">${formatCurrency(data.amountPaid)}</div>
              <div style="color: #6b7280; font-size: 16px; font-weight: 500;">Invoice #${escapeHtml(data.invoiceNumber)}</div>
            </div>
          </td>
          <td width="30%" valign="middle" align="right" style="padding: 0 16px;">
            <img src="${INVOICE_ILLUSTRATION_URL}" alt="Refund Request" width="94" style="border-radius: 8px;" />
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
          We have received your refund request for the payment of ${formatCurrency(data.amountPaid)} for invoice #${escapeHtml(data.invoiceNumber)}.
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="16px" line-height="24px" padding-top="10px">
          Your request is now being reviewed by ${escapeHtml(data.businessName)}. You will receive another email once a decision has been made.
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
