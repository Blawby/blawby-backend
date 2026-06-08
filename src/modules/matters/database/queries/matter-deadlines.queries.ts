import { eq, asc } from 'drizzle-orm';
import {
  matterDeadlines,
  type InsertMatterDeadline,
  type SelectMatterDeadline,
} from '@/modules/matters/database/schema/matter-deadlines.schema';
import { getActiveTx } from '@/shared/database/uow';

const createMatterDeadline = async (data: InsertMatterDeadline): Promise<SelectMatterDeadline> => {
  const [deadline] = await getActiveTx().insert(matterDeadlines).values(data).returning();
  return deadline;
};

const findMatterDeadlineById = async (id: string): Promise<SelectMatterDeadline | undefined> => {
  const [deadline] = await getActiveTx().select().from(matterDeadlines).where(eq(matterDeadlines.id, id)).limit(1);
  return deadline;
};

const listMatterDeadlines = async (matterId: string): Promise<SelectMatterDeadline[]> =>
  await getActiveTx()
    .select()
    .from(matterDeadlines)
    .where(eq(matterDeadlines.matter_id, matterId))
    .orderBy(asc(matterDeadlines.date));

const updateMatterDeadline = async (
  id: string,
  data: Partial<InsertMatterDeadline>
): Promise<SelectMatterDeadline | undefined> => {
  const [updated] = await getActiveTx()
    .update(matterDeadlines)
    .set({ ...data, updated_at: new Date() })
    .where(eq(matterDeadlines.id, id))
    .returning();
  return updated;
};

const deleteMatterDeadline = async (id: string): Promise<void> => {
  await getActiveTx().delete(matterDeadlines).where(eq(matterDeadlines.id, id));
};

export const matterDeadlinesQueries = {
  createMatterDeadline,
  findMatterDeadlineById,
  listMatterDeadlines,
  updateMatterDeadline,
  deleteMatterDeadline,
};
