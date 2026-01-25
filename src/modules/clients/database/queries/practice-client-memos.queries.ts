import { eq, desc } from 'drizzle-orm';
import {
  practiceClientMemosSchema,
  type InsertPracticeClientMemo,
  type SelectPracticeClientMemo,
} from '@/modules/clients/database/schema/practice-client-memos.schema';
import { db } from '@/shared/database';

const { practiceClientMemos } = practiceClientMemosSchema;

const create = async (
  data: InsertPracticeClientMemo,
): Promise<SelectPracticeClientMemo> => {
  const [memo] = await db
    .insert(practiceClientMemos)
    .values(data)
    .returning();
  return memo;
};

const findById = async (
  id: string,
): Promise<SelectPracticeClientMemo | undefined> => {
  const [result] = await db
    .select()
    .from(practiceClientMemos)
    .where(eq(practiceClientMemos.id, id))
    .limit(1);
  return result;
};

const update = async (
  id: string,
  data: Partial<SelectPracticeClientMemo>,
): Promise<SelectPracticeClientMemo | undefined> => {
  const [updated] = await db
    .update(practiceClientMemos)
    .set({ ...data, updated_at: new Date() })
    .where(eq(practiceClientMemos.id, id))
    .returning();
  return updated;
};

const remove = async (id: string): Promise<boolean> => {
  const [deleted] = await db
    .delete(practiceClientMemos)
    .where(eq(practiceClientMemos.id, id))
    .returning();
  return !!deleted;
};

const listByClient = async (
  clientId: string,
): Promise<SelectPracticeClientMemo[]> => {
  return await db
    .select()
    .from(practiceClientMemos)
    .where(eq(practiceClientMemos.client_id, clientId))
    .orderBy(desc(practiceClientMemos.created_at));
};

export const practiceClientMemosRepository = {
  create,
  findById,
  update,
  delete: remove,
  listByClient,
};
