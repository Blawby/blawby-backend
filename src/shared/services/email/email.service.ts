/**
 * Email Service
 *
 * Core email sending functionality using Resend
 */

import { Resend } from 'resend';
import type { EmailJobPayload, EmailSendOptions } from './email.types';
import { renderTemplate } from '@/shared/services/email/templates';
import { db } from '@/shared/database/connection';
import { emailLogs } from '@/shared/services/email/schemas/email-logs.schema';
import fs from 'node:fs';
import path from 'node:path';

// Lazy-initialized Resend client
let _resend: Resend | null = null;

const getResendClient = (): Resend => {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('Missing RESEND_API_KEY environment variable');
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
};

// Default email configuration
const DEFAULT_FROM = process.env.EMAIL_FROM_ADDRESS || 'notifications@blawby.com';
const DEFAULT_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Blawby';

/**
 * Save email to local file for development preview
 */
const saveEmailToFile = (to: string, subject: string, html: string) => {
  if (process.env.NODE_ENV === 'production') return;

  try {
    const storageDir = path.join(process.cwd(), 'storage', 'emails');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    const filename = `${Date.now()}-${to.replace(/[^a-z0-9]/gi, '_')}.html`;
    const filePath = path.join(storageDir, filename);

    const content = `
      <!-- Subject: ${subject} -->
      <!-- To: ${to} -->
      <div style="background: #f4f4f4; padding: 10px; border-bottom: 1px solid #ddd; font-family: sans-serif;">
        <strong>To:</strong> ${to}<br>
        <strong>Subject:</strong> ${subject}<br>
        <strong>Time:</strong> ${new Date().toLocaleString()}
      </div>
      ${html}
    `;

    fs.writeFileSync(filePath, content);
    console.log(`📂 Email saved for preview: file://${filePath}`);
  } catch (error) {
    console.error('Failed to save email to file:', error);
  }
};

/**
 * Send an email using Resend
 */
export const sendEmail = async (
  payload: EmailJobPayload,
  options: EmailSendOptions = {},
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    // Render the template to HTML
    const html = renderTemplate(payload.template, payload.data);

    // Development: Save to file for instant preview
    if (process.env.NODE_ENV !== 'production') {
      saveEmailToFile(payload.to, payload.subject, html);
    }

    // Send via Resend
    const apiKey = process.env.RESEND_API_KEY;
    const isLocal = process.env.NODE_ENV !== 'production';

    // Skip actual sending if no API key in dev
    if (isLocal && (!apiKey || apiKey === 'fake' || apiKey.startsWith('re_your_'))) {
      console.log(`📡 [DEV] Skipping actual Resend call for "${payload.subject}". Local preview saved.`);

      // Log success in DB for local tracking
      void db.insert(emailLogs).values({
        recipientEmail: payload.to,
        subject: payload.subject,
        templateName: payload.template,
        templateData: payload.data,
        status: 'sent',
        messageId: 'local_preview_' + Date.now(),
      }).catch(err => console.error('Failed to log email success:', err));

      return { success: true, messageId: 'local_preview' };
    }

    const result = await getResendClient().emails.send({
      from: options.from || `${DEFAULT_FROM_NAME} <${DEFAULT_FROM}>`,
      to: payload.to,
      subject: payload.subject,
      html,
      replyTo: options.replyTo,
      cc: options.cc,
      bcc: options.bcc,
    });

    if (result.error) {
      console.error(`❌ Email send failed:`, result.error);

      // Log failure (fire and forget)
      void db.insert(emailLogs).values({
        recipientEmail: payload.to,
        subject: payload.subject,
        templateName: payload.template,
        templateData: payload.data,
        status: 'failed',
        errorMessage: result.error.message,
      }).catch(err => console.error('Failed to log email failure:', err));

      return {
        success: false,
        error: result.error.message,
      };
    }

    console.log(`✅ Email sent successfully: ${result.data?.id}`);

    // Log success (fire and forget)
    void db.insert(emailLogs).values({
      recipientEmail: payload.to,
      subject: payload.subject,
      templateName: payload.template,
      templateData: payload.data,
      status: 'sent',
      messageId: result.data?.id,
    }).catch(err => console.error('Failed to log email success:', err));

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Email send error:`, errorMessage);

    // Log unexpected error (fire and forget)
    void db.insert(emailLogs).values({
      recipientEmail: payload.to,
      subject: payload.subject,
      templateName: payload.template,
      templateData: payload.data,
      status: 'failed',
      errorMessage: errorMessage,
    }).catch(err => console.error('Failed to log unexpected email error:', err));

    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Send a batch of emails
 */
export const sendBulkEmails = async (
  payloads: EmailJobPayload[],
  options: EmailSendOptions = {},
): Promise<{ success: boolean; results: Array<{ to: string; success: boolean; error?: string }> }> => {
  const results = await Promise.all(
    payloads.map(async (payload) => {
      const result = await sendEmail(payload, options);
      return {
        to: payload.to,
        success: result.success,
        error: result.error,
      };
    }),
  );

  const allSuccessful = results.every((r) => r.success);

  return {
    success: allSuccessful,
    results,
  };
};
