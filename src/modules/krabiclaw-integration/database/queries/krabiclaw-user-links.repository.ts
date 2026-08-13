import { eq } from 'drizzle-orm';

import {
  krabiclawUserLinks,
  type InsertKrabiClawUserLink,
  type SelectKrabiClawUserLink,
} from '@/modules/krabiclaw-integration/database/schema/krabiclaw-user-links.schema';
import { getActiveTx } from '@/shared/database/uow';

const findByExternalId = async (externalUserId: string): Promise<SelectKrabiClawUserLink | undefined> => {
  const [link] = await getActiveTx()
    .select()
    .from(krabiclawUserLinks)
    .where(eq(krabiclawUserLinks.external_user_id, externalUserId))
    .limit(1);
  return link;
};

const create = async (data: InsertKrabiClawUserLink): Promise<SelectKrabiClawUserLink> => {
  const [link] = await getActiveTx()
    .insert(krabiclawUserLinks)
    .values(data)
    .onConflictDoNothing({ target: krabiclawUserLinks.external_user_id })
    .returning();
  if (link) {
    return link;
  }

  const existing = await findByExternalId(data.external_user_id);
  if (!existing) {
    throw new Error('Failed to create krabiclaw user link');
  }
  return existing;
};

export const krabiclawUserLinksRepository = {
  findByExternalId,
  create,
};
