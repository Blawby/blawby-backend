/**
 * Customer Payment Request (Invoice) Email Template
 */

import type { CustomerPaymentRequestData } from '../../email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  formatCurrency,
  COLORS,
  INVOICE_ILLUSTRATION_URL,
} from '../base.template';

export const customerPaymentRequest = (data: CustomerPaymentRequestData): string => {
  const lineItemsHtml = data.lineItems
    .map(
      (item) => `
      <tr>
        <td style="padding-bottom: 8px; font-size: 16px; font-weight: 500; color: ${COLORS.text};">${item.description}</td>
        <td style="text-align: right; padding-bottom: 8px; font-size: 16px; font-weight: 500; color: ${COLORS.text};">${formatCurrency(item.unitPrice)}</td>
      </tr>
      <tr>
        <td style="color: #999999; font-size: 14px; padding-bottom: 16px;">Qty ${item.quantity}</td>
        <td></td>
      </tr>
    `,
    )
    .join('');

  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column width="70%">
        <mj-text color="${COLORS.textMuted}" font-size="16px" font-weight="500">
          Invoice from ${data.businessName}
        </mj-text>
        <mj-text color="${COLORS.text}" font-size="38px" font-weight="600" line-height="42px" padding-top="5px">
          ${formatCurrency(data.amountDue)}
        </mj-text>
        <mj-text color="${COLORS.textMuted}" font-size="16px" font-weight="500" padding-top="5px">
          Due ${data.dueDate}
        </mj-text>
      </mj-column>
      <mj-column width="30%">
        <mj-image src="${INVOICE_ILLUSTRATION_URL}" alt="Invoice" width="94px" border-radius="8px" align="right" />
      </mj-column>
    `)}

    ${cardSection(`
      <mj-column>
        <mj-divider border-color="${COLORS.border}" />
        <mj-table>
          <tr>
            <td style="color: ${COLORS.textMuted}; font-size: 16px; font-weight: 500; padding: 4px;">To:</td>
            <td style="font-size: 16px; font-weight: 500; padding: 4px;">${data.recipientName}</td>
          </tr>
          <tr>
            <td style="color: ${COLORS.textMuted}; font-size: 16px; font-weight: 500; padding: 4px;">From:</td>
            <td style="font-size: 16px; font-weight: 500; padding: 4px;">${data.businessName}</td>
          </tr>
        </mj-table>
        <mj-button href="${data.paymentLink}">
          Pay this invoice
        </mj-button>
      </mj-column>
    `)}

    ${cardSection(`
      <mj-column>
        <mj-text font-size="18px" font-weight="500">Invoice #${data.invoiceNumber}</mj-text>
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
          Questions? ${data.supportUrl ? `Visit <a href="${data.supportUrl}" style="color: #000000;">${data.supportUrl}</a> or ` : ''}
          Contact us at <a href="mailto:${data.supportEmail}" style="color: #000000;">${data.supportEmail}</a>.
        </mj-text>
      </mj-column>
    `)}
  `,
    data.teamPhotoUrl,
  );

  return renderMjml(mjmlContent);
};
