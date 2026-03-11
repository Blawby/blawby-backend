import { eq } from 'drizzle-orm';
import type { Organization, NewOrganization } from '@/modules/practice/types/organization.types';
import { organizations } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';

/**
 * Organization Repository
 *
 * Centralized database operations for organizations.
 */
const findById = async (id: string): Promise<Organization | null> => {
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);

  return organization || null;
};

const findBySlug = async (slug: string): Promise<Organization | null> => {
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  return organization || null;
};

const update = async (
  id: string,
  data: Partial<Omit<NewOrganization, 'id'>>,
): Promise<Organization | null> => {
  const [organization] = await db
    .update(organizations)
    .set(data)
    .where(eq(organizations.id, id))
    .returning();

  return organization || null;
};

/**
 * Organization Repository Object
 */
export const organizationRepository = {
  findById,
  findBySlug,
  update,
};

export default organizationRepository;
