import { eq, and, like, isNull } from 'drizzle-orm';
import { db } from '@/shared/database';
import {
  practiceAreas,
  type InsertPracticeArea,
  type SelectPracticeArea,
} from '@/modules/matters/database/schema/practice-areas.schema';

// Create practice area
export const createPracticeArea = async (
  data: InsertPracticeArea,
): Promise<SelectPracticeArea> => {
  const [practiceArea] = await db
    .insert(practiceAreas)
    .values(data)
    .returning();
  return practiceArea;
};

// Find practice area by ID
export const findPracticeAreaById = async (
  id: string,
): Promise<SelectPracticeArea | undefined> => {
  const [practiceArea] = await db
    .select()
    .from(practiceAreas)
    .where(eq(practiceAreas.id, id))
    .limit(1);
  return practiceArea;
};

// List practice areas by organization
export const listPracticeAreasByOrganization = async (
  organizationId: string,
): Promise<SelectPracticeArea[]> => {
  return await db
    .select()
    .from(practiceAreas)
    .where(eq(practiceAreas.organizationId, organizationId))
    .orderBy(practiceAreas.name);
};

// Update practice area
export const updatePracticeArea = async (
  id: string,
  data: Partial<InsertPracticeArea>,
): Promise<SelectPracticeArea | undefined> => {
  const [practiceArea] = await db
    .update(practiceAreas)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(practiceAreas.id, id))
    .returning();
  return practiceArea;
};

// Delete practice area
export const deletePracticeArea = async (id: string): Promise<void> => {
  await db.delete(practiceAreas).where(eq(practiceAreas.id, id));
};

// Search practice areas
export const searchPracticeAreas = async (
  organizationId: string,
  searchTerm: string,
): Promise<SelectPracticeArea[]> => {
  return await db
    .select()
    .from(practiceAreas)
    .where(
      and(
        eq(practiceAreas.organizationId, organizationId),
        like(practiceAreas.name, `%${searchTerm}%`),
      ),
    )
    .orderBy(practiceAreas.name);
};
