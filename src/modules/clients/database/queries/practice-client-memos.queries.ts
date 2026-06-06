import { eq, and, desc, sql, type SQL } from 'drizzle-orm';
import {
  practiceClientMemos,
  type InsertPracticeClientMemo,
  type SelectPracticeClientMemo,
} from '@/modules/clients/database/schema/practice-client-memos.schema';
import { getActiveTx } from '@/shared/database/uow';

const create = async (data: InsertPracticeClientMemo): Promise<SelectPracticeClientMemo> => {
  const [memo] = await getActiveTx().insert(practiceClientMemos).values(data).returning();
  return memo;
};

const findById = async (id: string): Promise<SelectPracticeClientMemo | undefined> =>
  await getActiveTx().query.practiceClientMemos.findFirst({
    where: eq(practiceClientMemos.id, id),
  });

const findByClientId = async (clientId: string): Promise<SelectPracticeClientMemo[]> =>
  await getActiveTx()
    .select()
    .from(practiceClientMemos)
    .where(eq(practiceClientMemos.client_id, clientId))
    .orderBy(desc(practiceClientMemos.created_at));

const update = async (
  id: string,
  data: Partial<SelectPracticeClientMemo>
): Promise<SelectPracticeClientMemo | undefined> => {
  const [updated] = await getActiveTx()
    .update(practiceClientMemos)
    .set({ ...data, updated_at: new Date() })
    .where(eq(practiceClientMemos.id, id))
    .returning();
  return updated;
};

const deleteMemo = async (id: string): Promise<SelectPracticeClientMemo | undefined> => {
  const [deleted] = await getActiveTx().delete(practiceClientMemos).where(eq(practiceClientMemos.id, id)).returning();
  return deleted;
};

const listMemos = async (params: {
  clientId: string;
  limit?: number;
  offset?: number;
}): Promise<{
  data: SelectPracticeClientMemo[];
  total: number;
}> => {
  const { clientId, limit = 20, offset = 0 } = params;

  const conditions: SQL[] = [eq(practiceClientMemos.client_id, clientId)];
  const whereClause = and(...conditions);

  const [totalResult] = await getActiveTx()
    .select({ count: sql<number>`count(*)` })
    .from(practiceClientMemos)
    .where(whereClause);

  const data = await getActiveTx()
    .select()
    .from(practiceClientMemos)
    .where(whereClause)
    .orderBy(desc(practiceClientMemos.created_at))
    .limit(limit)
    .offset(offset);

  return {
    data,
    total: Number(totalResult?.count || 0),
  };
};

export const practiceClientMemosRepository = {
  create,
  findById,
  findByClientId,
  update,
  deleteMemo,
  listMemos,
};
