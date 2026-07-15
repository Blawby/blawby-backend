import {
  notifications,
  type InsertNotification,
  type SelectNotification,
} from '@/modules/notifications/database/schema/notifications.schema';
import type { DeliveryOutcome, ListNotificationsQuery } from '@/modules/notifications/types/notifications.types';
import { getActiveTx } from '@/shared/database/uow';
import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

interface NotificationScope {
  organizationId: string;
  recipientUserId: string;
}

const findByDedupeKey = async (
  data: Pick<InsertNotification, 'organization_id' | 'recipient_user_id' | 'channel' | 'deduplication_key'>
): Promise<SelectNotification | undefined> => {
  if (!data.deduplication_key) {
    return undefined;
  }

  const [row] = await getActiveTx()
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.organization_id, data.organization_id),
        eq(notifications.recipient_user_id, data.recipient_user_id),
        eq(notifications.channel, data.channel),
        eq(notifications.deduplication_key, data.deduplication_key)
      )
    )
    .limit(1);
  return row;
};

const create = async (data: InsertNotification): Promise<{ record: SelectNotification; created: boolean }> => {
  const [record] = await getActiveTx().insert(notifications).values(data).onConflictDoNothing().returning();
  if (record) {
    return { record, created: true };
  }

  const existing = await findByDedupeKey(data);
  if (!existing) {
    throw new Error('Notification insert conflicted without a matching deduplication key');
  }
  return { record: existing, created: false };
};

const listForRecipient = async (
  scope: NotificationScope,
  query: ListNotificationsQuery
): Promise<{ data: SelectNotification[]; total: number }> => {
  const conditions = [
    eq(notifications.organization_id, scope.organizationId),
    eq(notifications.recipient_user_id, scope.recipientUserId),
    eq(notifications.channel, 'dashboard'),
  ];
  if (query.unread_only) {
    conditions.push(isNull(notifications.read_at));
  }

  const where = and(...conditions);
  const offset = (query.page - 1) * query.limit;
  const [data, totals] = await Promise.all([
    getActiveTx()
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.created_at))
      .limit(query.limit)
      .offset(offset),
    getActiveTx().select({ total: count() }).from(notifications).where(where),
  ]);

  return { data, total: totals[0]?.total ?? 0 };
};

const findDashboardForRecipient = async (
  id: string,
  scope: NotificationScope
): Promise<SelectNotification | undefined> => {
  const [row] = await getActiveTx()
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.organization_id, scope.organizationId),
        eq(notifications.recipient_user_id, scope.recipientUserId),
        eq(notifications.channel, 'dashboard')
      )
    )
    .limit(1);
  return row;
};

const markRead = async (id: string, scope: NotificationScope): Promise<SelectNotification | undefined> => {
  const now = new Date();
  const [row] = await getActiveTx()
    .update(notifications)
    .set({ read_at: now, updated_at: now })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.organization_id, scope.organizationId),
        eq(notifications.recipient_user_id, scope.recipientUserId),
        eq(notifications.channel, 'dashboard')
      )
    )
    .returning();
  return row;
};

const recordDeliveryOutcome = async (
  id: string,
  organizationId: string,
  outcome: DeliveryOutcome
): Promise<SelectNotification | undefined> => {
  const now = new Date();
  const [row] = await getActiveTx()
    .update(notifications)
    .set({
      status: outcome.status,
      provider_message_id: outcome.status === 'sent' ? (outcome.providerMessageId ?? null) : null,
      failure_code: outcome.status === 'sent' ? null : (outcome.failureCode ?? null),
      attempt_count: sql`${notifications.attempt_count} + 1`,
      last_attempt_at: now,
      delivered_at: outcome.status === 'sent' ? now : null,
      updated_at: now,
    })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.organization_id, organizationId),
        inArray(notifications.status, ['pending', 'failed'])
      )
    )
    .returning();
  return row;
};

const findByIdAndOrg = async (id: string, organizationId: string): Promise<SelectNotification | undefined> => {
  const [row] = await getActiveTx()
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.organization_id, organizationId)))
    .limit(1);
  return row;
};

export const notificationsQueries = {
  create,
  listForRecipient,
  findDashboardForRecipient,
  markRead,
  recordDeliveryOutcome,
  findByIdAndOrg,
};
