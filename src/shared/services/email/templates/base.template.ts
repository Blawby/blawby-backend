/**
 * Base MJML Template
 *
 * Provides the common layout wrapper for all email templates
 */

import mjml2html from 'mjml';
import { getLogger } from '@logtape/logtape';

const logger = getLogger(['shared', 'email', 'template', 'base']);

// Common styles
const COLORS = {
  background: '#030712',
  white: '#ffffff',
  text: '#1A1A1A',
  textMuted: '#7A7A7A',
  textDark: '#414552',
  primary: '#2563eb',
  subtext: '#64748b',
  border: '#eaeaea',
};

const BLAWBY_LOGO_URL = 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/27bc2bf2-8582-4ed1-e77c-45d7a3215b00/public';
const INVOICE_ILLUSTRATION_URL =
  'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/02417d17-e2fb-4494-2ab5-ba89ef347e00/public';

/**
 * Currency formatter for USD
 */
export const formatCurrency = (amountInCents: number): string => {
  if (!Number.isFinite(amountInCents)) {
    throw new Error('Invalid amountInCents: not a finite number');
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amountInCents / 100);
};

/**
 * Escape HTML special characters
 */
export const escapeHtml = (str: string): string => {
  if (!str) {
    return '';
  }
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Sanitize URLs to prevent protocol-based attacks
 */
export const sanitizeUrl = (url: string | undefined): string => {
  if (!url) {
    return '#';
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      return '#';
    }
    return url;
  } catch {
    // If it's a relative URL or invalid, return # for safety
    // For our use case, we usually expect absolute URLs for links
    return '#';
  }
};

/**
 * Wrap content in the base email layout
 */
export const baseLayout = (content: string, headerImageUrl?: string): string => {
  const sanitizedHeaderImage = sanitizeUrl(headerImageUrl);
  const headerImg = sanitizedHeaderImage === '#' ? BLAWBY_LOGO_URL : sanitizedHeaderImage;

  return `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="'Proxima Nova', Arial, sans-serif" />
      <mj-text font-size="16px" line-height="26px" color="#1a1a1a" />
      <mj-button background-color="#1a202c" color="#ffffff" font-size="18px" font-weight="500" border-radius="6px" padding="14px 32px" />
    </mj-attributes>
    <mj-style>
      .divider { border-bottom: 1px solid #e5e5e5; margin: 12px 0; }
    </mj-style>
  </mj-head>
  <mj-body background-color="#ffffff">
    <!-- Header with Logo -->
    <mj-section padding="12px 0">
      <mj-column>
        <mj-image src="${headerImg}" alt="Logo" width="80px" border-radius="12px" />
      </mj-column>
    </mj-section>

    ${content}

    <!-- Footer -->
    <mj-section background-color="#f8fafc" padding="16px 32px">
      <mj-column>
        <mj-text align="center" color="#64748b" font-size="14px">
          &copy; ${new Date().getFullYear()} Blawby. All rights reserved.
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
export const cardSection = (content: string): string => `
    <mj-section background-color="#ffffff" border-radius="12px" padding="16px">
      ${content}
    </mj-section>
    <mj-section padding="6px 0"></mj-section>
  `;

export const emailAction = (label: string, url: string): string => {
  const safeUrl = sanitizeUrl(url);
  if (safeUrl === '#') {
    throw new Error('Email action requires a safe absolute URL');
  }
  return `<mj-button href="${safeUrl}">${escapeHtml(label)}</mj-button>`;
};

export const emailCallout = (content: string, tone: 'info' | 'success' | 'warning' = 'info'): string => {
  const colors = {
    info: { background: '#eff6ff', border: '#2563eb' },
    success: { background: '#ecfdf5', border: '#059669' },
    warning: { background: '#fffbeb', border: '#d97706' },
  } as const;
  const color = colors[tone];
  return `<mj-text background-color="${color.background}" border-left="4px solid ${color.border}" padding="16px">${escapeHtml(content)}</mj-text>`;
};

export const emailDetails = (rows: readonly { label: string; value: string }[]): string =>
  `<mj-table>${rows
    .map(
      ({ label, value }) =>
        `<tr><td style="padding: 6px 12px 6px 0; font-weight: 600;">${escapeHtml(label)}</td><td style="padding: 6px 0;">${escapeHtml(value)}</td></tr>`
    )
    .join('')}</mj-table>`;

export const emailDivider = (): string => `<mj-divider border-color="${COLORS.border}" padding="24px 0" />`;

export const emailLegalNotice = (content: string): string =>
  `<mj-text color="${COLORS.textMuted}" font-size="13px" line-height="19px">${escapeHtml(content)}</mj-text>`;

/**
 * Render MJML to HTML
 */
export const renderMjml = async (mjmlContent: string): Promise<string> => {
  const result = await mjml2html(mjmlContent, {
    validationLevel: 'soft',
  });

  if (result.errors && result.errors.length > 0) {
    logger.warn('MJML rendering warnings: {warnings}', {
      warnings: result.errors,
    });
  }

  return result.html;
};

export { COLORS, BLAWBY_LOGO_URL, INVOICE_ILLUSTRATION_URL };
