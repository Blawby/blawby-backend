import { pgTable, uuid, text, json, timestamp } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

/**
 * Email Logs Table
 * 
 * Tracks all emails sent by the application for auditing and debugging.
 */
export const emailLogs = pgTable('email_logs', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Recipient info
  recipientEmail: text('recipient_email').notNull(),

  // Email content/metadata
  subject: text('subject').notNull(),
  templateName: text('template_name').notNull(),
  templateData: json('template_data').notNull().$type<Record<string, unknown>>(),

  // Delivery status
  status: text('status', { enum: ['sent', 'failed'] }).notNull(),
  messageId: text('message_id'), // From Resend
  errorMessage: text('error_message'),

  // Timestamps
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Zod schemas for validation
export const createEmailLogSchema = createInsertSchema(emailLogs);
export const selectEmailLogSchema = createSelectSchema(emailLogs);

// Types
export type EmailLog = typeof emailLogs.$inferSelect;
export type NewEmailLog = typeof emailLogs.$inferInsert;
