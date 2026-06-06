import { eq, and, desc } from 'drizzle-orm';
import { engagementTemplates } from '@/modules/engagement-templates/database/schema/engagement-templates.schema';
import type {
  InsertEngagementTemplate,
  SelectEngagementTemplate,
} from '@/modules/engagement-templates/database/schema/engagement-templates.schema';
import { db } from '@/shared/database';

const insert = async (data: InsertEngagementTemplate, tx: typeof db = db): Promise<SelectEngagementTemplate> => {
  const [record] = await tx.insert(engagementTemplates).values(data).returning();
  if (!record) {
    throw new Error('Failed to insert engagement template');
  }
  return record;
};

const findById = async (id: string, tx: typeof db = db): Promise<SelectEngagementTemplate | undefined> => {
  const [record] = await tx.select().from(engagementTemplates).where(eq(engagementTemplates.id, id)).limit(1);
  return record;
};

const listByPractice = async (
  practiceId: string,
  tx: typeof db = db
): Promise<SelectEngagementTemplate[]> => {
  return tx
    .select()
    .from(engagementTemplates)
    .where(eq(engagementTemplates.practice_id, practiceId))
    .orderBy(desc(engagementTemplates.created_at));
};

const update = async (
  id: string,
  data: Partial<InsertEngagementTemplate>,
  tx: typeof db = db
): Promise<SelectEngagementTemplate> => {
  const [record] = await tx.update(engagementTemplates).set(data).where(eq(engagementTemplates.id, id)).returning();
  if (!record) {
    throw new Error('Failed to update engagement template');
  }
  return record;
};

const remove = async (id: string, tx: typeof db = db): Promise<void> => {
  await tx.delete(engagementTemplates).where(eq(engagementTemplates.id, id));
};

const findByIdAndPractice = async (
  id: string,
  practiceId: string,
  tx: typeof db = db
): Promise<SelectEngagementTemplate | undefined> => {
  const [record] = await tx
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
