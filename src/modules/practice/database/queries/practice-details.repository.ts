import { eq, inArray } from 'drizzle-orm';
import {
  practiceDetails,
  type InsertPracticeDetails,
  type PracticeDetails,
  type PracticeService,
} from '@/modules/practice/database/schema/practice.schema';
import { organizations } from '@/schema/better-auth-schema';
import { getActiveTx } from '@/shared/database/uow';

export const createPracticeDetails = async (data: InsertPracticeDetails): Promise<PracticeDetails> => {
  const [practiceDetail] = await getActiveTx().insert(practiceDetails).values(data).returning();
  return practiceDetail;
};

export const findPracticeDetailsByOrganization = async (
  organizationId: string
): Promise<(PracticeDetails & { services: PracticeService[] }) | undefined> =>
  await getActiveTx().query.practiceDetails.findFirst({
    where: (details) => eq(details.organization_id, organizationId),
    with: {
      services: true,
    },
  });

export const findPracticeDetailsByOrganizations = async (organizationIds: string[]): Promise<PracticeDetails[]> =>
  organizationIds.length === 0
    ? []
    : await getActiveTx()
        .select()
        .from(practiceDetails)
        .where(inArray(practiceDetails.organization_id, organizationIds));

export const findPracticeWithOrganization = async (
  organizationId: string
): Promise<{
  practice: PracticeDetails | null;
  organization: typeof organizations.$inferSelect | null;
}> => {
  const result = await getActiveTx()
    .select({
      practice: practiceDetails,
      organization: organizations,
    })
    .from(organizations)
    .leftJoin(practiceDetails, eq(practiceDetails.organization_id, organizations.id))
    .where(eq(organizations.id, organizationId))
    .limit(1);

  const [row] = result;
  return {
    practice: row?.practice ?? null,
    organization: row?.organization || null,
  };
};

export const updatePracticeDetails = async (
  organizationId: string,
  data: Partial<InsertPracticeDetails>
): Promise<PracticeDetails | undefined> => {
  const [practiceDetail] = await getActiveTx()
    .update(practiceDetails)
    .set(data)
    .where(eq(practiceDetails.organization_id, organizationId))
    .returning();
  return practiceDetail;
};

export const upsertPracticeDetails = async (
  organizationId: string,
  userId: string,
  data: Partial<InsertPracticeDetails>
): Promise<PracticeDetails> => {
  const { id: _id, created_at: _created_at, updated_at: _updated_at, ...dataWithoutMetadata } = data;
  const [result] = await getActiveTx()
    .insert(practiceDetails)
    .values({
      organization_id: organizationId,
      user_id: userId,
      ...dataWithoutMetadata,
    })
    .onConflictDoUpdate({
      target: practiceDetails.organization_id,
      set: {
        ...dataWithoutMetadata,
        updated_at: new Date(),
      },
    })
    .returning();

  return result;
};

export const insertOrIgnorePracticeDetails = async (
  organizationId: string,
  userId: string,
  data: Partial<InsertPracticeDetails>
): Promise<PracticeDetails | null> => {
  const { id: _id, created_at: _created_at, updated_at: _updated_at, ...dataWithoutMetadata } = data;
  const [result] = await getActiveTx()
    .insert(practiceDetails)
    .values({
      id: crypto.randomUUID(),
      organization_id: organizationId,
      user_id: userId,
      ...dataWithoutMetadata,
    })
    .onConflictDoNothing({
      target: practiceDetails.organization_id,
    })
    .returning();

  return result || null;
};

export const deletePracticeDetails = async (organizationId: string): Promise<void> => {
  await getActiveTx().delete(practiceDetails).where(eq(practiceDetails.organization_id, organizationId));
};
