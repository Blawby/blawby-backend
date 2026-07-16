import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '@logtape/logtape';
import { Resend } from 'resend';
import type { EmailJobPayload, EmailSendOptions, EmailTemplateName } from '@/shared/services/email/email.types';
import { config } from '@/shared/config';
import { db } from '@/shared/database/connection';
import { appConfigService } from '@/shared/services/app-config.service';
import { emailLogs } from '@/shared/services/email/schemas/email-logs.schema';
import { renderTemplate, type TemplateDataMap } from '@/shared/services/email/templates';
import { isProduction } from '@/shared/utils/env';

const logger = getLogger(['shared', 'services', 'email']);

let resend: Resend | null = null;

const getResendClient = (): Resend => {
  if (!resend) {
    const apiKey = config.email.resendApiKey;
    if (!apiKey) {
      throw new Error('Missing RESEND_API_KEY environment variable');
    }
    resend = new Resend(apiKey);
  }
  return resend;
};

const DEFAULT_FROM = 'notifications@blawby.com';
const DEFAULT_FROM_NAME = 'Blawby';

const recordEmailLog = async (
  payload: EmailJobPayload,
  result: { status: 'sent' | 'failed'; messageId?: string; errorMessage?: string }
): Promise<void> => {
  await db.insert(emailLogs).values({
    recipientEmail: payload.to,
    subject: payload.subject,
    templateName: payload.template,
    templateData: payload.data,
    status: result.status,
    messageId: result.messageId,
    errorMessage: result.errorMessage,
  });
};

const saveEmailToFile = (to: string, subject: string, html: string): void => {
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

export const sendEmail = async (
  payload: EmailJobPayload,
  options: EmailSendOptions = {}
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  const idempotencyKey = payload.idempotencyKey ?? randomUUID();

  try {
    // TemplateDataMap is the registry boundary; queue payloads are keyed by the same template name.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const html = await renderTemplate(payload.template, payload.data as unknown as TemplateDataMap[EmailTemplateName]);

    if (!isProduction()) {
      saveEmailToFile(payload.to, payload.subject, html);
    }

    if (payload.to.endsWith('@test-blawby.com')) {
      const messageId = `test-domain:${payload.template}:${idempotencyKey}`;
      logger.info('[TEST_DOMAIN] Skipping provider delivery to test address: {to}', { to: payload.to });
      await recordEmailLog(payload, { status: 'sent', messageId });
      return { success: true, messageId };
    }

    if (config.email.deliveryMode === 'log_only') {
      const messageId = `log-only:${payload.template}:${idempotencyKey}`;
      logger.info('[LOG_ONLY] Rendered email without provider delivery: {subject}', { subject: payload.subject });
      await recordEmailLog(payload, { status: 'sent', messageId });
      return { success: true, messageId };
    }

    const apiKey = config.email.resendApiKey;
    if (!apiKey || apiKey === 'fake' || apiKey.startsWith('re_your_')) {
      throw new Error('EMAIL_DELIVERY_MODE=provider requires a valid RESEND_API_KEY');
    }

    const [fromAddress, fromName] = await Promise.all([
      appConfigService.get<string>('email_from_address'),
      appConfigService.get<string>('email_from_name'),
    ]);

    const result = await getResendClient().emails.send(
      {
        from: options.from ?? `${fromName ?? DEFAULT_FROM_NAME} <${fromAddress ?? DEFAULT_FROM}>`,
        to: payload.to,
        subject: payload.subject,
        html,
        replyTo: options.replyTo,
        cc: options.cc,
        bcc: options.bcc,
      },
      { idempotencyKey }
    );

    if (result.error) {
      logger.error('Email send failed: {error}', { error: result.error });
      await recordEmailLog(payload, { status: 'failed', errorMessage: result.error.message });
      return { success: false, error: result.error.message };
    }

    const messageId = result.data?.id;
    logger.info('Email sent successfully: {messageId}', { messageId });
    await recordEmailLog(payload, { status: 'sent', messageId });
    return { success: true, messageId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Email send error: {error}', { error: errorMessage });

    try {
      await recordEmailLog(payload, { status: 'failed', errorMessage });
      return { success: false, error: errorMessage };
    } catch (auditError) {
      const auditMessage = auditError instanceof Error ? auditError.message : 'Unknown audit log error';
      logger.error('Failed to record email failure: {error}', { error: auditMessage });
      return { success: false, error: `${errorMessage}; audit log failed: ${auditMessage}` };
    }
  }
};

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

  return {
    success: results.every((result) => result.success),
    results,
  };
};
