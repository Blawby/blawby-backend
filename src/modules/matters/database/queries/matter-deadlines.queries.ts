import { eq, asc, and } from 'drizzle-orm';
import {
  matterDeadlines,
  serializeAlertDays,
  type InsertMatterDeadline,
  type SelectMatterDeadline,
} from '@/modules/matters/database/schema/matter-deadlines.schema';
import { db } from '@/shared/database';

const createMatterDeadline = async (data: InsertMatterDeadline): Promise<SelectMatterDeadline> => {
  const [deadline] = await db.insert(matterDeadlines).values(data).returning();
  return deadline;
};

const findMatterDeadlineById = async (id: string): Promise<SelectMatterDeadline | undefined> => {
  const [deadline] = await db.select().from(matterDeadlines).where(eq(matterDeadlines.id, id)).limit(1);
  return deadline;
};

const listMatterDeadlines = async (matterId: string): Promise<SelectMatterDeadline[]> =>
  await db
    .select()
    .from(matterDeadlines)
    .where(eq(matterDeadlines.matter_id, matterId))
    .orderBy(asc(matterDeadlines.date));

const updateMatterDeadline = async (
  id: string,
  data: Partial<InsertMatterDeadline> & { alert_days_before_arr?: number[] }
): Promise<SelectMatterDeadline | undefined> => {
  const { alert_days_before_arr, ...rest } = data;
  const patch: Partial<InsertMatterDeadline> = { ...rest, updated_at: new Date() };
  if (alert_days_before_arr !== undefined) {
    patch.alert_days_before = serializeAlertDays(alert_days_before_arr);
  }

  const [updated] = await db.update(matterDeadlines).set(patch).where(eq(matterDeadlines.id, id)).returning();
  return updated;
};

const deleteMatterDeadline = async (id: string): Promise<void> => {
  await db.delete(matterDeadlines).where(and(eq(matterDeadlines.id, id)));
};

export const matterDeadlinesQueries = {
  createMatterDeadline,
  findMatterDeadlineById,
  listMatterDeadlines,
  updateMatterDeadline,
  deleteMatterDeadline,
};
