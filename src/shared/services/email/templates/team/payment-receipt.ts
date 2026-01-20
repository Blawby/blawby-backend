/**
 * Team Payment Receipt Email Template
 */

import type { TeamPaymentReceiptData } from '../../email.types';
import {
  baseLayout,
  cardSection,
  renderMjml,
  formatCurrency,
  COLORS,
  BLAWBY_LOGO_URL,
} from '../base.template';

export const teamPaymentReceipt = (data: TeamPaymentReceiptData): string => {
  const lineItemsHtml = data.lineItems
    .map(
      (item) => `
      <tr>
        <td style="padding-bottom: 16px; padding-top: 8px; font-size: 16px; font-weight: 500; color: ${COLORS.text};">
          <a href="${data.invoiceUrl}" style="color: #000000; text-decoration: none; font-weight: 700;">
            ${formatCurrency(item.amount)}
          </a> — ${item.description}
        </td>
      </tr>
    `,
    )
    .join('');

  const mjmlContent = baseLayout(
    `
    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.textDark}" font-size="24px" font-weight="700" line-height="28px">
          Congratulations ${data.businessName}!
        </mj-text>
        <mj-text color="${COLORS.textDark}" font-size="16px" font-weight="500" padding-top="10px">
          You've received a payment of ${formatCurrency(data.amountPaid)} through Blawby.
        </mj-text>
      </mj-column>
    `)}

    ${cardSection(`
      <mj-column>
        <mj-text color="${COLORS.textDark}" font-size="14px" font-weight="700">PAYMENT</mj-text>
        <mj-table>
          ${lineItemsHtml}
        </mj-table>
        <mj-divider border-color="${COLORS.border}" />
        
        <mj-text color="${COLORS.textDark}" font-size="14px" font-weight="700">CLIENT NAME</mj-text>
        <mj-text padding-top="8px">${data.recipientName}</mj-text>
        <mj-divider border-color="${COLORS.border}" />
        
        <mj-text color="${COLORS.textDark}" font-size="14px" font-weight="700">CLIENT EMAIL</mj-text>
        <mj-text padding-top="8px">${data.recipientEmail || 'Not provided'}</mj-text>
        <mj-divider border-color="${COLORS.border}" />
        
        <mj-text color="${COLORS.textDark}" font-size="14px" font-weight="700">PAYMENT METHOD</mj-text>
        <mj-text padding-top="8px">${data.paymentMethod || 'Not specified'}</mj-text>
        ${data.payingOnBehalfOf
        ? `
          <mj-divider border-color="${COLORS.border}" />
          <mj-text color="${COLORS.textDark}" font-size="14px" font-weight="700">PAYING ON BEHALF OF</mj-text>
          <mj-text padding-top="8px">${data.payingOnBehalfOf}</mj-text>
        `
        : ''
      }
        <mj-divider border-color="${COLORS.border}" />
        
        <mj-text color="${COLORS.textDark}" font-size="14px" font-weight="700">PAYMENT ID</mj-text>
        <mj-text padding-top="8px">${data.invoiceNumber}</mj-text>
        <mj-divider border-color="${COLORS.border}" />
        
        <mj-text color="${COLORS.textMuted}">
          Questions? ${data.supportUrl ? `Visit <a href="${data.supportUrl}" style="color: #000000;">${data.supportUrl}</a> or ` : ''}
          Contact us at <a href="mailto:${data.supportEmail}" style="color: #000000;">${data.supportEmail}</a>.
        </mj-text>
      </mj-column>
    `)}
  `,
    BLAWBY_LOGO_URL,
  );

  return renderMjml(mjmlContent);
};
