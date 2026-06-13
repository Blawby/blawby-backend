import {
  intakeConversations,
  type InsertIntakeConversation,
  type SelectIntakeConversation,
} from '@/modules/intake-conversations/database/schema/intake-conversations.schema';
import type { ListIntakeConversationsQuery } from '@/modules/intake-conversations/types/intake-conversations.types';
import { getActiveTx } from '@/shared/database/uow';
import { and, count, desc, eq, sql } from 'drizzle-orm';

const findById = async (id: string): Promise<SelectIntakeConversation | undefined> => {
  const [row] = await getActiveTx().select().from(intakeConversations).where(eq(intakeConversations.id, id)).limit(1);
  return row;
};

const findByIdAndOrg = async (id: string, organizationId: string): Promise<SelectIntakeConversation | undefined> => {
  const [row] = await getActiveTx()
    .select()
    .from(intakeConversations)
    .where(and(eq(intakeConversations.id, id), eq(intakeConversations.organization_id, organizationId)))
    .limit(1);
  return row;
};

const list = async (
  filters: ListIntakeConversationsQuery
): Promise<{ data: SelectIntakeConversation[]; total: number }> => {
  const { practice_id, status, lifecycle_status, assigned_to_user_id, page, limit } = filters;
  const offset = (page - 1) * limit;

  const conditions = [eq(intakeConversations.organization_id, practice_id)];
  if (status) {
    conditions.push(eq(intakeConversations.status, status));
  }
  if (lifecycle_status) {
    conditions.push(eq(intakeConversations.lifecycle_status, lifecycle_status));
  }
  if (assigned_to_user_id) {
    conditions.push(eq(intakeConversations.assigned_to_user_id, assigned_to_user_id));
  }

  const where = and(...conditions);

  const [data, countResult] = await Promise.all([
    getActiveTx()
      .select()
      .from(intakeConversations)
      .where(where)
      .orderBy(desc(intakeConversations.last_message_at))
      .limit(limit)
      .offset(offset),
    getActiveTx().select({ total: count() }).from(intakeConversations).where(where),
  ]);

  return { data, total: countResult[0]?.total ?? 0 };
};

const create = async (data: InsertIntakeConversation): Promise<SelectIntakeConversation> => {
  const [row] = await getActiveTx().insert(intakeConversations).values(data).onConflictDoNothing().returning();
  if (!row) {
    const existing = await findById(data.id);
    if (!existing) throw new Error(`IntakeConversation not found after conflict for id ${data.id}`);
    return existing;
  }
  return row;
};

const update = async (
  id: string,
  data: Partial<InsertIntakeConversation>,
  organizationId?: string
): Promise<SelectIntakeConversation | undefined> => {
  const where = organizationId
    ? and(eq(intakeConversations.id, id), eq(intakeConversations.organization_id, organizationId))
    : eq(intakeConversations.id, id);
  const [row] = await getActiveTx()
    .update(intakeConversations)
    .set({ ...data, updated_at: new Date() })
    .where(where)
    .returning();
  return row;
};

const updateLifecycleStatus = async (
  id: string,
  lifecycleStatus: 'pending_visibility' | 'visible' | 'archived',
  organizationId: string
): Promise<void> => {
  await getActiveTx()
    .update(intakeConversations)
    .set({ lifecycle_status: lifecycleStatus, updated_at: new Date() })
    .where(and(eq(intakeConversations.id, id), eq(intakeConversations.organization_id, organizationId)));
};

const softDelete = async (id: string, organizationId: string): Promise<SelectIntakeConversation | undefined> =>
  update(id, { status: 'archived', lifecycle_status: 'archived' }, organizationId);

const updateLatestSeq = async (
  id: string,
  seq: number,
  lastMessageAt: Date,
  lastMessageContent: string
): Promise<void> => {
  await getActiveTx()
    .update(intakeConversations)
    .set({
      latest_seq: seq,
      last_message_at: lastMessageAt,
      last_message_content: lastMessageContent,
      updated_at: new Date(),
    })
    .where(and(eq(intakeConversations.id, id), sql`${intakeConversations.latest_seq} < ${seq}`));
};

export const intakeConversationsQueries = {
  findById,
  findByIdAndOrg,
  list,
  create,
  update,
  updateLifecycleStatus,
  softDelete,
  updateLatestSeq,
};
