/**
 * Customer Payment Request (Invoice) Email Template
 */

import type { CustomerPaymentRequestData } from '../../email.types';
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

export const customerPaymentRequest = (data: CustomerPaymentRequestData): string => {
  const lineItemsHtml = data.lineItems
    .map(
      (item) => `
      <tr>
        <td style="padding-bottom: 8px; font-size: 16px; font-weight: 500; color: #1a1a1a;">${escapeHtml(item.description)}</td>
        <td style="text-align: right; padding-bottom: 8px; font-size: 16px; font-weight: 500; color: #1a1a1a;">${formatCurrency(item.unitPrice)}</td>
      </tr>
      <tr>
        <td style="color: #6b7280; font-size: 14px; padding-bottom: 16px;">Qty ${item.quantity}</td>
        <td></td>
      </tr>
    `
    )
    .join('');

  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-table>
        <tr>
          <td width="70%" valign="middle" align="left" style="padding: 0 16px;">
            <div>
              <div style="color: #6b7280; font-size: 16px; font-weight: 500; margin-bottom: 5px;">Invoice from ${escapeHtml(data.businessName)}</div>
              <div style="color: #1a1a1a; font-size: 38px; font-weight: 600; line-height: 42px; margin-bottom: 5px;">${formatCurrency(data.amountDue)}</div>
              <div style="color: #6b7280; font-size: 16px; font-weight: 500;">Due ${escapeHtml(data.dueDate)}</div>
            </div>
          </td>
          <td width="30%" valign="middle" align="right" style="padding: 0 16px;">
            <img src="${INVOICE_ILLUSTRATION_URL}" alt="Invoice" width="94" style="border-radius: 8px;" />
          </td>
        </tr>
      </mj-table>
    `)}

    ${cardSection(`
      <mj-column>
        <mj-divider border-color="${COLORS.border}" />
        <mj-table>
          <tr>
            <td style="color: ${COLORS.textMuted}; font-size: 16px; font-weight: 500; padding: 4px;">To:</td>
            <td style="font-size: 16px; font-weight: 500; padding: 4px;">${escapeHtml(data.recipientName)}</td>
          </tr>
          <tr>
            <td style="color: ${COLORS.textMuted}; font-size: 16px; font-weight: 500; padding: 4px;">From:</td>
            <td style="font-size: 16px; font-weight: 500; padding: 4px;">${escapeHtml(data.businessName)}</td>
          </tr>
        </mj-table>
        <mj-button href="${sanitizeUrl(data.paymentLink)}">
          Pay this invoice
        </mj-button>
      </mj-column>
    `)}

    ${cardSection(`
      <mj-column>
        <mj-text font-size="18px" font-weight="500">Invoice #${escapeHtml(data.invoiceNumber)}</mj-text>
        <mj-table>
          ${lineItemsHtml}
          <tr style="border-top: 1px solid ${COLORS.border};">
            <td style="padding-top: 16px; font-size: 16px; font-weight: 500;">Total due</td>
            <td style="text-align: right; padding-top: 16px; font-size: 16px; font-weight: 500;">${formatCurrency(data.amountDue)}</td>
          </tr>
          <tr>
            <td style="padding-top: 8px; font-size: 16px; font-weight: 500;">Amount paid</td>
            <td style="text-align: right; padding-top: 8px; font-size: 16px; font-weight: 500;">${formatCurrency(data.amountPaid)}</td>
          </tr>
          <tr>
            <td style="padding-top: 8px; font-size: 16px; font-weight: 500;">Amount remaining</td>
            <td style="text-align: right; padding-top: 8px; font-size: 16px; font-weight: 500;">${formatCurrency(data.amountRemaining)}</td>
          </tr>
        </mj-table>
        <mj-divider border-color="${COLORS.border}" />
        <mj-text color="${COLORS.textMuted}">
          Questions? ${data.supportUrl ? `Visit <a href="${sanitizeUrl(data.supportUrl)}" style="color: #1a202c;">${escapeHtml(data.supportUrl)}</a> or ` : ''}
          Contact us at <a href="mailto:${escapeHtml(data.supportEmail)}" style="color: #1a202c;">${escapeHtml(data.supportEmail)}</a>.
        </mj-text>
      </mj-column>
    `)}
  `,
    data.teamPhotoUrl
  );

  return renderMjml(mjmlContent);
};
