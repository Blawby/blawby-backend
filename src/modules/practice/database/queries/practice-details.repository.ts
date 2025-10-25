import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type {
  InsertPracticeDetails,
  PracticeDetails,
} from '@/modules/practice/database/schema/practice.schema';
import { practiceDetails } from '@/modules/practice/database/schema/practice.schema';
import * as schema from '@/schema';
import { organizations } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';

export const createPracticeDetails = async (
  data: InsertPracticeDetails,
): Promise<PracticeDetails> => {
  const [practiceDetail] = await db
    .insert(practiceDetails)
    .values(data)
    .returning();
  return practiceDetail;
};

export const findPracticeDetailsByOrganization = async (
  organizationId: string,
): Promise<PracticeDetails | undefined> => {
  const [practiceDetail] = await db
    .select()
    .from(practiceDetails)
    .where(eq(practiceDetails.organization_id, organizationId))
    .limit(1);
  return practiceDetail;
};

export const findPracticeWithOrganization = async (
  organizationId: string,
): Promise<{
  practice: PracticeDetails | null;
  organization: typeof organizations.$inferSelect | null;
}> => {
  const result = await db
    .select({
      practice: practiceDetails,
      organization: organizations,
    })
    .from(organizations)
    .leftJoin(
      practiceDetails,
      eq(practiceDetails.organization_id, organizations.id),
    )
    .where(eq(organizations.id, organizationId))
    .limit(1);

  const row = result[0];
  return {
    practice: row?.practice || null,
    organization: row?.organization || null,
  };
};

export const updatePracticeDetails = async (
  organizationId: string,
  data: Partial<InsertPracticeDetails>,
): Promise<PracticeDetails | undefined> => {
  const [practiceDetail] = await db
    .update(practiceDetails)
    .set(data)
    .where(eq(practiceDetails.organization_id, organizationId))
    .returning();
  return practiceDetail;
};

export const upsertPracticeDetails = async (
  organizationId: string,
  userId: string,
  data: Partial<InsertPracticeDetails>,
): Promise<PracticeDetails> => {
  const [result] = await db
    .insert(practiceDetails)
    .values({
      organization_id: organizationId,
      user_id: userId,
      ...data,
    })
    .onConflictDoUpdate({
      target: practiceDetails.organization_id,
      set: {
        ...data,
        updated_at: new Date(),
      },
    })
    .returning();

  return result;
};

export const insertOrIgnorePracticeDetails = async (
  organizationId: string,
  userId: string,
  data: Partial<InsertPracticeDetails>,
): Promise<PracticeDetails | null> => {
  const [result] = await db
    .insert(practiceDetails)
    .values({
      organization_id: organizationId,
      user_id: userId,
      ...data,
    })
    .onConflictDoNothing({
      target: practiceDetails.organization_id,
    })
    .returning();

  return result || null;
};

export const deletePracticeDetails = async (
  db: NodePgDatabase<typeof schema>,
  organizationId: string,
): Promise<void> => {
  await db
    .delete(practiceDetails)
    .where(eq(practiceDetails.organization_id, organizationId));
};
