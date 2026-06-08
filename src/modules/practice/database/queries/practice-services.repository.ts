import { eq, inArray, and } from 'drizzle-orm';
import { practiceServices, type PracticeService } from '@/modules/practice/database/schema/practice.schema';
import { getActiveTx } from '@/shared/database/uow';

const findServicesByOrganization = async (organizationId: string): Promise<PracticeService[]> =>
  await getActiveTx().select().from(practiceServices).where(eq(practiceServices.organization_id, organizationId));

const findServicesByOrganizations = async (organizationIds: string[]): Promise<PracticeService[]> =>
  organizationIds.length === 0
    ? []
    : await getActiveTx()
        .select()
        .from(practiceServices)
        .where(inArray(practiceServices.organization_id, organizationIds));

const syncServicesTx = async (
  organizationId: string,
  newServices: { id?: string; name: string; key: string; description?: string }[]
): Promise<PracticeService[]> => {
  const existingServices = await getActiveTx()
    .select()
    .from(practiceServices)
    .where(eq(practiceServices.organization_id, organizationId));

  const newServiceIds = newServices.filter((s) => s.id).map((s) => s.id!);

  if (existingServices.length > 0) {
    const servicesToDelete = existingServices.filter((s) => !newServiceIds.includes(s.id));
    if (servicesToDelete.length > 0) {
      await getActiveTx()
        .delete(practiceServices)
        .where(
          and(
            eq(practiceServices.organization_id, organizationId),
            inArray(
              practiceServices.id,
              servicesToDelete.map((s) => s.id)
            )
          )
        );
    }
  }

  const upsertPromises = newServices.map(async (service) => {
    if (service.id) {
      const [updated] = await getActiveTx()
        .update(practiceServices)
        .set({
          name: service.name,
          key: service.key,
          description: service.description,
          updated_at: new Date(),
        })
        .where(and(eq(practiceServices.id, service.id), eq(practiceServices.organization_id, organizationId)))
        .returning();
      return updated;
    } else {
      const [inserted] = await getActiveTx()
        .insert(practiceServices)
        .values({
          organization_id: organizationId,
          name: service.name,
          key: service.key,
          description: service.description,
        })
        .returning();
      return inserted;
    }
  });

  const results = await Promise.all(upsertPromises);
  return results.filter((s): s is PracticeService => Boolean(s));
};

const findById = async (id: string): Promise<PracticeService | undefined> => {
  const [service] = await getActiveTx().select().from(practiceServices).where(eq(practiceServices.id, id)).limit(1);
  return service;
};

export const practiceServicesRepository = {
  findServicesByOrganization,
  findServicesByOrganizations,
  syncServicesTx,
  findById,
};
