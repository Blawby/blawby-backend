import { eq } from 'drizzle-orm';

import {
  krabiclawOrganizationLinks,
  type InsertKrabiClawOrganizationLink,
  type SelectKrabiClawOrganizationLink,
} from '@/modules/krabiclaw-integration/database/schema/krabiclaw-organization-links.schema';
import { getActiveTx } from '@/shared/database/uow';

const findByExternalId = async (
  externalOrganizationId: string
): Promise<SelectKrabiClawOrganizationLink | undefined> => {
  const [link] = await getActiveTx()
    .select()
    .from(krabiclawOrganizationLinks)
    .where(eq(krabiclawOrganizationLinks.external_organization_id, externalOrganizationId))
    .limit(1);
  return link;
};

const create = async (data: InsertKrabiClawOrganizationLink): Promise<SelectKrabiClawOrganizationLink> => {
  const [link] = await getActiveTx()
    .insert(krabiclawOrganizationLinks)
    .values(data)
    .onConflictDoNothing({ target: krabiclawOrganizationLinks.external_organization_id })
    .returning();
  if (link) {
    return link;
  }

  const existing = await findByExternalId(data.external_organization_id);
  if (!existing) {
    throw new Error('Failed to create krabiclaw organization link');
  }
  return existing;
};

export const krabiclawOrganizationLinksRepository = {
  findByExternalId,
  create,
};
