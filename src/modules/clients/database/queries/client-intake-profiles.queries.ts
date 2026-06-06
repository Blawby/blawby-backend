import { eq } from 'drizzle-orm';
import {
  clientIntakeProfiles,
  type InsertClientIntakeProfile,
  type SelectClientIntakeProfile,
} from '@/modules/clients/database/schema/client-intake-profiles.schema';
import { getActiveTx } from '@/shared/database/uow';

type UpsertProfileData = Partial<Omit<InsertClientIntakeProfile, 'id' | 'client_id' | 'created_at' | 'updated_at'>>;

const findByClientId = async (clientId: string): Promise<SelectClientIntakeProfile | undefined> =>
  getActiveTx().query.clientIntakeProfiles.findFirst({
    where: eq(clientIntakeProfiles.client_id, clientId),
  });

const upsert = async (clientId: string, data: UpsertProfileData): Promise<SelectClientIntakeProfile> => {
  const [row] = await getActiveTx()
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
