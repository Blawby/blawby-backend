/**
 * Email Service
 *
 * Core email sending functionality using Resend
 */

import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '@logtape/logtape';
import { Resend } from 'resend';
import type { EmailJobPayload, EmailSendOptions, EmailTemplateName } from './email.types';
import { config } from '@/shared/config';
import { db } from '@/shared/database/connection';
import { appConfigService } from '@/shared/services/app-config.service';
import { emailLogs } from '@/shared/services/email/schemas/email-logs.schema';
import { renderTemplate, type TemplateDataMap } from '@/shared/services/email/templates';
import { isProduction, isTest, isProductionLike } from '@/shared/utils/env';

const logger = getLogger(['shared', 'services', 'email']);

// Lazy-initialized Resend client
let _resend: Resend | null = null;

const getResendClient = (): Resend => {
  if (!_resend) {
    const apiKey = config.email.resendApiKey;
    if (!apiKey) {
      throw new Error('Missing RESEND_API_KEY environment variable');
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
};

// Default email configuration
const DEFAULT_FROM = 'notifications@blawby.com';
const DEFAULT_FROM_NAME = 'Blawby';

/**
 * Save email to local file for development preview
 */
const saveEmailToFile = (to: string, subject: string, html: string) => {
  if (isProduction()) {
    return;
  }

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
        <strong>Time:</strong> ${new Date().toISOString()}
      </div>
      ${html}
    `;

    fs.writeFileSync(filePath, content);
    logger.info('Email saved for preview: file://{filePath}', { filePath });
  } catch (error) {
    logger.error('Failed to save email to file: {error}', { error });
  }
};

/**
 * Send an email using Resend
 */
export const sendEmail = async (
  payload: EmailJobPayload,
  options: EmailSendOptions = {}
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    // Render the template to HTML
    const html = renderTemplate(payload.template, payload.data as unknown as TemplateDataMap[EmailTemplateName]);

    // Development/Test: Save to file for instant preview
    if (!isProduction()) {
      saveEmailToFile(payload.to, payload.subject, html);
    }

    // Send via Resend
    const apiKey = config.email.resendApiKey;
    const isProdLike = isProductionLike();
    const isTestMode = isTest();

    // Skip actual sending if:
    // 1. Not in production/staging
    // 2. OR no valid API key
    // 3. OR specifically in test mode
    const shouldSkip = !isProdLike || !apiKey || apiKey === 'fake' || apiKey.startsWith('re_your_') || isTestMode;

    if (shouldSkip) {
      const reason = isTestMode ? 'TEST' : !isProdLike ? 'DEV' : 'NO_API_KEY';
      logger.info('📡 [{reason}] Skipping actual Resend call for "{subject}". Local preview saved.', {
        reason,
        subject: payload.subject,
      });

      // Log success in DB for local tracking
      void db
        .insert(emailLogs)
        .values({
          recipientEmail: payload.to,
          subject: payload.subject,
          templateName: payload.template,
          templateData: payload.data,
          status: 'sent',
          messageId: `${reason.toLowerCase()}_preview_${Date.now()}`,
        })
        .catch((err) => logger.error('Failed to log email success to database: {error}', { error: err }));

      return { success: true, messageId: `${reason.toLowerCase()}_preview` };
    }

    // Get "from" details from app config
    const [fromAddress, fromName] = await Promise.all([
      appConfigService.get<string>('email_from_address'),
      appConfigService.get<string>('email_from_name'),
    ]);

    const result = await getResendClient().emails.send({
      from: options.from ?? `${fromName ?? DEFAULT_FROM_NAME} <${fromAddress ?? DEFAULT_FROM}>`,
      to: payload.to,
      subject: payload.subject,
      html,
      replyTo: options.replyTo,
      cc: options.cc,
      bcc: options.bcc,
    });

    if (result.error) {
      logger.error('❌ Email send failed: {error}', { error: result.error });

      // Log failure (fire and forget)
      void db
        .insert(emailLogs)
        .values({
          recipientEmail: payload.to,
          subject: payload.subject,
          templateName: payload.template,
          templateData: payload.data,
          status: 'failed',
          errorMessage: result.error.message,
        })
        .catch((err) => logger.error('Failed to log email failure to database: {error}', { error: err }));

      return {
        success: false,
        error: result.error.message,
      };
    }

    logger.info('✅ Email sent successfully: {messageId}', { messageId: result.data?.id });

    // Log success (fire and forget)
    void db
      .insert(emailLogs)
      .values({
        recipientEmail: payload.to,
        subject: payload.subject,
        templateName: payload.template,
        templateData: payload.data,
        status: 'sent',
        messageId: result.data?.id,
      })
      .catch((err) => logger.error('Failed to log email success to database: {error}', { error: err }));

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('❌ Email send error: {error}', { error: errorMessage });

    // Log unexpected error (fire and forget)
    void db
      .insert(emailLogs)
      .values({
        recipientEmail: payload.to,
        subject: payload.subject,
        templateName: payload.template,
        templateData: payload.data,
        status: 'failed',
        errorMessage: errorMessage,
      })
      .catch((err) => logger.error('Failed to log unexpected email error to database: {error}', { error: err }));

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
  options: EmailSendOptions = {}
): Promise<{ success: boolean; results: { to: string; success: boolean; error?: string }[] }> => {
  const results = await Promise.all(
    payloads.map(async (payload) => {
      const result = await sendEmail(payload, options);
      return {
        to: payload.to,
        success: result.success,
        error: result.error,
      };
    })
  );

  const allSuccessful = results.every((r) => r.success);

  return {
    success: allSuccessful,
    results,
  };
};
