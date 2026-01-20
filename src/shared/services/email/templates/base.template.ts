/**
 * Base MJML Template
 *
 * Provides the common layout wrapper for all email templates
 */

import mjml2html from 'mjml';

// Common styles
const COLORS = {
  background: '#030712',
  white: '#ffffff',
  text: '#1A1A1A',
  textMuted: '#7A7A7A',
  textDark: '#414552',
  border: '#eaeaea',
};

const BLAWBY_LOGO_URL = 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/264e9151-7efb-4aa3-0063-61622211ea00/public';
const INVOICE_ILLUSTRATION_URL = 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/02417d17-e2fb-4494-2ab5-ba89ef347e00/public';

/**
 * Currency formatter for USD
 */
export const formatCurrency = (amountInCents: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amountInCents / 100);
};

/**
 * Wrap content in the base email layout
 */
export const baseLayout = (content: string, headerImageUrl?: string): string => {
  const headerImg = headerImageUrl || BLAWBY_LOGO_URL;

  return `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="'Proxima Nova', Arial, sans-serif" />
      <mj-text font-size="16px" line-height="26px" color="${COLORS.text}" />
      <mj-button background-color="#000000" color="#ffffff" font-size="18px" font-weight="500" border-radius="6px" padding="14px 32px" />
    </mj-attributes>
    <mj-style>
      .divider { border-bottom: 1px solid ${COLORS.border}; margin: 20px 0; }
    </mj-style>
  </mj-head>
  <mj-body background-color="${COLORS.background}">
    <!-- Header with Logo -->
    <mj-section padding="20px 0">
      <mj-column>
        <mj-image src="${headerImg}" alt="Logo" width="80px" border-radius="12px" />
      </mj-column>
    </mj-section>

    ${content}

    <!-- Footer -->
    <mj-section padding="20px 0">
      <mj-column>
        <mj-text align="center" color="#ffffff" font-size="14px">
          Powered by <a href="https://blawby.com" style="color: #ffffff;">Blawby</a> |
          <a href="https://blawby.com/invoicing" style="color: #ffffff;">Learn more about Blawby Invoicing</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;
};

/**
 * Create a white card section (common pattern in all emails)
 */
export const cardSection = (content: string): string => {
  return `
    <mj-section background-color="${COLORS.white}" border-radius="12px" padding="24px">
      ${content}
    </mj-section>
    <mj-section padding="10px 0"></mj-section>
  `;
};

/**
 * Render MJML to HTML
 */
export const renderMjml = (mjmlContent: string): string => {
  const result = mjml2html(mjmlContent, {
    validationLevel: 'soft',
  });

  if (result.errors && result.errors.length > 0) {
    console.warn('MJML rendering warnings:', result.errors);
  }

  return result.html;
};

export { COLORS, BLAWBY_LOGO_URL, INVOICE_ILLUSTRATION_URL };
