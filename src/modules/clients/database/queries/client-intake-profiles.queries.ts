import { eq } from 'drizzle-orm';
import {
  clientIntakeProfiles,
  type InsertClientIntakeProfile,
  type SelectClientIntakeProfile,
} from '@/modules/clients/database/schema/client-intake-profiles.schema';
import { db } from '@/shared/database';

type UpsertProfileData = Partial<Omit<InsertClientIntakeProfile, 'id' | 'client_id' | 'created_at' | 'updated_at'>>;

const findByClientId = async (clientId: string): Promise<SelectClientIntakeProfile | undefined> =>
  await db.query.clientIntakeProfiles.findFirst({
    where: eq(clientIntakeProfiles.client_id, clientId),
  });

/**
 * Create the profile if absent, otherwise merge the provided fields onto the
 * existing row (partial update). Atomic via the unique `client_id` constraint.
 */
const upsert = async (clientId: string, data: UpsertProfileData): Promise<SelectClientIntakeProfile> => {
  const [row] = await db
    .insert(clientIntakeProfiles)
    .values({ client_id: clientId, ...data })
    .onConflictDoUpdate({
      target: clientIntakeProfiles.client_id,
      set: { ...data, updated_at: new Date() },
    })
    .returning();
  return row;
};

export const clientIntakeProfilesRepository = {
  findByClientId,
  upsert,
};
