import { notificationsQueries } from '@/modules/notifications/database/queries/notifications.queries';
import type { SelectNotification } from '@/modules/notifications/database/schema/notifications.schema';
import {
  createNotificationSchema,
  deliveryOutcomeSchema,
  type CreateNotificationInput,
  type DeliveryOutcome,
  type ListNotificationsQuery,
  type NotificationResponse,
} from '@/modules/notifications/types/notifications.types';
import type { ServiceContext } from '@/shared/types/service-context';
import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';

const toResponse = (row: SelectNotification): NotificationResponse => ({
  id: row.id,
  organization_id: row.organization_id,
  recipient_user_id: row.recipient_user_id,
  actor_user_id: row.actor_user_id,
  event_type: row.event_type,
  title: row.title,
  body: row.body,
  payload: row.payload,
  read_at: row.read_at?.toISOString() ?? null,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
});

const createNotification = async (
  input: CreateNotificationInput
): Promise<{ notification: SelectNotification; created: boolean }> => {
  const parsed = createNotificationSchema.parse(input);
  const createdAt = new Date();
  const result = await notificationsQueries.create({
    organization_id: parsed.organizationId,
    recipient_user_id: parsed.recipientUserId,
    actor_user_id: parsed.actorUserId,
    channel: parsed.channel,
    status: parsed.channel === 'dashboard' ? 'sent' : 'pending',
    event_type: parsed.eventType,
    template_name: parsed.templateName,
    title: parsed.title,
    body: parsed.body,
    payload: parsed.payload,
    deduplication_key: parsed.deduplicationKey,
    delivered_at: parsed.channel === 'dashboard' ? createdAt : undefined,
  });

  return { notification: result.record, created: result.created };
};

const listMyNotifications = async (
  query: ListNotificationsQuery,
  ctx: ServiceContext
): Promise<{ data: NotificationResponse[]; pagination: { total: number; page: number; limit: number } }> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Notification');
  const result = await notificationsQueries.listForRecipient(
    { organizationId: ctx.organizationId, recipientUserId: ctx.userId },
    query
  );
  return {
    data: result.data.map(toResponse),
    pagination: { total: result.total, page: query.page, limit: query.limit },
  };
};

const markRead = async (id: string, ctx: ServiceContext): Promise<NotificationResponse> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Notification');
  const scope = { organizationId: ctx.organizationId, recipientUserId: ctx.userId };
  const existing = await notificationsQueries.findDashboardForRecipient(id, scope);
  if (!existing) {
    throw new HTTPException(404, { message: 'Notification not found' });
  }
  if (existing.read_at) {
    return toResponse(existing);
  }

  const updated = await notificationsQueries.markRead(id, scope);
  if (!updated) {
    throw new HTTPException(404, { message: 'Notification not found' });
  }
  return toResponse(updated);
};

const recordDeliveryOutcome = async (
  id: string,
  organizationId: string,
  outcome: DeliveryOutcome
): Promise<SelectNotification> => {
  const parsed = deliveryOutcomeSchema.parse(outcome);
  const updated = await notificationsQueries.recordDeliveryOutcome(id, organizationId, parsed);
  if (updated) {
    return updated;
  }

  const existing = await notificationsQueries.findByIdAndOrg(id, organizationId);
  if (!existing) {
    throw new HTTPException(404, { message: 'Notification not found' });
  }
  if (existing.status === parsed.status) {
    return existing;
  }
  throw new HTTPException(409, { message: `Notification delivery is already ${existing.status}` });
};

export const notificationsService = {
  createNotification,
  listMyNotifications,
  markRead,
  recordDeliveryOutcome,
  toResponse,
};
