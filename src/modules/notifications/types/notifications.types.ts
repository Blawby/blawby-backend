import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
} from '@/modules/notifications/database/schema/notifications.schema';
import { z } from '@hono/zod-openapi';

export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);
export const notificationStatusSchema = z.enum(NOTIFICATION_STATUSES);

export const createNotificationSchema = z
  .object({
    organizationId: z.uuid(),
    recipientUserId: z.uuid(),
    actorUserId: z.uuid().optional(),
    channel: notificationChannelSchema,
    eventType: z.string().trim().min(1).max(100),
    templateName: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(2000).optional(),
    payload: z.record(z.string(), z.unknown()).default({}),
    deduplicationKey: z.string().trim().min(1).max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.channel === 'email' && !value.templateName) {
      ctx.addIssue({
        code: 'custom',
        path: ['templateName'],
        message: 'Email notifications require a template name',
      });
    }
  });

export const listNotificationsQuerySchema = z.object({
  unread_only: z.stringbool().default(false),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const notificationResponseSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  recipient_user_id: z.uuid(),
  actor_user_id: z.uuid().nullable(),
  event_type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  read_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const notificationListResponseSchema = z.object({
  data: z.array(notificationResponseSchema),
  pagination: z.object({
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
  }),
});

export const deliveryOutcomeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('sent'), providerMessageId: z.string().trim().min(1).max(255).optional() }),
  z.object({ status: z.literal('failed'), failureCode: z.string().trim().min(1).max(100) }),
  z.object({ status: z.literal('skipped'), failureCode: z.string().trim().min(1).max(100).optional() }),
]);

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type NotificationResponse = z.infer<typeof notificationResponseSchema>;
export type DeliveryOutcome = z.infer<typeof deliveryOutcomeSchema>;
