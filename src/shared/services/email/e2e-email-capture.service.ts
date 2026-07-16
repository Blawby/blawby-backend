import { getLogger } from '@logtape/logtape';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { config } from '@/shared/config';
import { db } from '@/shared/database/connection';
import { EMAIL_TEMPLATES } from '@/shared/services/email/email.types';
import { emailLogs } from '@/shared/services/email/schemas/email-logs.schema';

const logger = getLogger(['shared', 'services', 'email', 'e2e-capture']);

interface QueuedEmailCapturePayload {
  template: string;
  to: string;
  subject: string;
  data: object;
}

const isCaptureEnabled = (): boolean => config.e2e.fixturesEnabled && config.env.isStaging && !config.env.isProduction;

const isAllowedRecipient = (email: string): boolean =>
  email.toLowerCase().endsWith(`@${config.e2e.emailAllowedDomain.toLowerCase()}`);

const getStringField = (data: object, key: string): string | undefined => {
  const value = Object.entries(data).find(([entryKey]) => entryKey === key)?.[1];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const captureQueuedEmail = async (payload: QueuedEmailCapturePayload): Promise<void> => {
  if (!isCaptureEnabled() || !isAllowedRecipient(payload.to)) {
    return;
  }

  try {
    await db.insert(emailLogs).values({
      recipientEmail: payload.to,
      subject: payload.subject,
      templateName: payload.template,
      templateData: Object.fromEntries(Object.entries(payload.data)),
      status: 'sent',
      messageId: `e2e_capture_${Date.now()}`,
    });
  } catch (error) {
    logger.error('Failed to capture E2E email for {to}: {error}', { to: payload.to, error });
  }
};

const findLatestPracticeInvitation = async (
  to: string
): Promise<{ inviteLink: string; capturedAt: Date } | undefined> => {
  if (!isCaptureEnabled() || !isAllowedRecipient(to)) {
    return undefined;
  }

  const rows = await db
    .select({
      templateData: emailLogs.templateData,
      createdAt: emailLogs.createdAt,
    })
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.recipientEmail, to),
        eq(emailLogs.templateName, EMAIL_TEMPLATES.PRACTICE_INVITATION),
        isNull(emailLogs.deletedAt)
      )
    )
    .orderBy(desc(emailLogs.createdAt))
    .limit(10);

  for (const row of rows) {
    const inviteLink = getStringField(row.templateData, 'inviteLink');
    if (inviteLink) {
      return { inviteLink, capturedAt: row.createdAt };
    }
  }

  return undefined;
};

export const e2eEmailCaptureService = {
  captureQueuedEmail,
  findLatestPracticeInvitation,
  isAllowedRecipient,
  isCaptureEnabled,
};
