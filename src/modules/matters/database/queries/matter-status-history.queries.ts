import { desc, eq } from 'drizzle-orm';
import {
  matterStatusHistory,
  type InsertMatterStatusHistory,
  type SelectMatterStatusHistory,
} from '@/modules/matters/database/schema/matter-status-history.schema';
import { getActiveTx } from '@/shared/database/uow';

const createMatterStatusHistory = async (
  data: InsertMatterStatusHistory
): Promise<SelectMatterStatusHistory> => {
  const [entry] = await getActiveTx().insert(matterStatusHistory).values(data).returning();
  if (!entry) {
    throw new Error('Failed to create matter status history entry');
  }
  return entry;
};

const listMatterStatusHistory = async (matterId: string): Promise<SelectMatterStatusHistory[]> =>
  await getActiveTx()
    .select()
    .from(matterStatusHistory)
    .where(eq(matterStatusHistory.matter_id, matterId))
    .orderBy(desc(matterStatusHistory.changed_at));

export const matterStatusHistoryQueries = {
  createMatterStatusHistory,
  listMatterStatusHistory,
};
