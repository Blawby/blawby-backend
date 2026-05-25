import { eq, inArray, and } from 'drizzle-orm';
import { practiceServices, type PracticeService } from '@/modules/practice/database/schema/practice.schema';
import { db } from '@/shared/database';

/**
 * Find all services for an organization
 */
const findServicesByOrganization = async (organizationId: string): Promise<PracticeService[]> =>
  await db.select().from(practiceServices).where(eq(practiceServices.organization_id, organizationId));

const findServicesByOrganizations = async (organizationIds: string[]): Promise<PracticeService[]> =>
  organizationIds.length === 0
    ? []
    : await db.select().from(practiceServices).where(inArray(practiceServices.organization_id, organizationIds));

/**
 * Upsert services for an organization within a transaction
 * Handles creating new ones, updating existing ones, and deleting removed ones.
 */
const syncServicesTx = async (
  tx: typeof db,
  organizationId: string,
  newServices: { id?: string; name: string; key: string; description?: string }[]
): Promise<PracticeService[]> => {
  const client = tx || db;

  // 1. Get existing services
  const existingServices = await client
    .select()
    .from(practiceServices)
    .where(eq(practiceServices.organization_id, organizationId));

  const newServiceIds = newServices.filter((s) => s.id).map((s) => s.id!);

  // 2. Delete services not in the new list
  if (existingServices.length > 0) {
    const servicesToDelete = existingServices.filter((s) => !newServiceIds.includes(s.id));
    if (servicesToDelete.length > 0) {
      await client.delete(practiceServices).where(
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

  // 3. Upsert services
  const upsertPromises = newServices.map(async (service) => {
    if (service.id) {
      // Update existing
      const [updated] = await client
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
      // Create new
      const [inserted] = await client
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

/**
 * Find service by ID
 */
const findById = async (id: string): Promise<PracticeService | undefined> => {
  const [service] = await db.select().from(practiceServices).where(eq(practiceServices.id, id)).limit(1);
  return service;
};

export const practiceServicesRepository = {
  findServicesByOrganization,
  findServicesByOrganizations,
  syncServicesTx,
  findById,
};
