import {
  type InsertEngagementTemplate,
  type SelectEngagementTemplate,
  engagementTemplates,
} from '@/modules/engagement-templates/database/schema/engagement-templates.schema';
import { getActiveTx } from '@/shared/database/uow';
import { and, desc, eq } from 'drizzle-orm';

const insert = async (data: InsertEngagementTemplate): Promise<SelectEngagementTemplate> => {
  const [record] = await getActiveTx().insert(engagementTemplates).values(data).returning();
  if (!record) {
    throw new Error('Failed to insert engagement template');
  }
  return record;
};

const findById = async (id: string): Promise<SelectEngagementTemplate | undefined> => {
  const [record] = await getActiveTx()
    .select()
    .from(engagementTemplates)
    .where(eq(engagementTemplates.id, id))
    .limit(1);
  return record;
};

const listByPractice = async (practiceId: string): Promise<SelectEngagementTemplate[]> =>
  getActiveTx()
    .select()
    .from(engagementTemplates)
    .where(eq(engagementTemplates.practice_id, practiceId))
    .orderBy(desc(engagementTemplates.created_at));

const update = async (id: string, data: Partial<InsertEngagementTemplate>): Promise<SelectEngagementTemplate> => {
  const [record] = await getActiveTx()
    .update(engagementTemplates)
    .set(data)
    .where(eq(engagementTemplates.id, id))
    .returning();
  if (!record) {
    throw new Error('Failed to update engagement template');
  }
  return record;
};

const remove = async (id: string): Promise<void> => {
  await getActiveTx().delete(engagementTemplates).where(eq(engagementTemplates.id, id));
};

const findByIdAndPractice = async (id: string, practiceId: string): Promise<SelectEngagementTemplate | undefined> => {
  const [record] = await getActiveTx()
    .select()
    .from(engagementTemplates)
    .where(and(eq(engagementTemplates.id, id), eq(engagementTemplates.practice_id, practiceId)))
    .limit(1);
  return record;
};

export const engagementTemplatesQueries = {
  insert,
  findById,
  findByIdAndPractice,
  listByPractice,
  update,
  remove,
};
