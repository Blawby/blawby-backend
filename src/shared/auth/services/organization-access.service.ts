import * as schema from '@/schema';
import { getActiveTx } from '@/shared/database/uow';
import { and, eq } from 'drizzle-orm';

export const checkClientIsOwner = async ({
  user,
  session,
}: {
  headers: Headers;
  user?: { id: string };
  session?: Record<string, unknown>;
}): Promise<boolean> => {
  const orgId = session?.activeOrganizationId;
  if (!orgId || typeof orgId !== 'string' || !user?.id) {
    return false;
  }
  try {
    const [member] = await getActiveTx()
      .select({ role: schema.members.role })
      .from(schema.members)
      .where(and(eq(schema.members.organizationId, orgId), eq(schema.members.userId, user.id)))
      .limit(1);
    return member?.role === 'owner';
  } catch {
    return false;
  }
};
