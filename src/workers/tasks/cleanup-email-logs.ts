import type { Task } from 'graphile-worker';
import { and, eq, lte } from 'drizzle-orm';
import { db } from '@/shared/database/connection';
import { emailLogs } from '@/shared/services/email/schemas/email-logs.schema';

/**
 * Anonymize PII from expired email log rows while preserving audit records.
 */
export const cleanupEmailLogs: Task = async (_input, helpers) => {
  const now = new Date();

  const result = await db
    .update(emailLogs)
    .set({
      recipientEmail: 'redacted@redacted.invalid',
      templateData: {},
      deletedAt: now,
      isAnonymized: true,
    })
    .where(and(lte(emailLogs.expiresAt, now), eq(emailLogs.isAnonymized, false)))
    .returning({ id: emailLogs.id });

  helpers.logger.info('Anonymized expired email logs', {
    anonymizedCount: result.length,
  });
};
