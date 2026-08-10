import * as schema from '@/schema';
import { getStaffRoles } from '@/shared/auth/permissions';
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

/**
 * OAuth-client privilege check used for both the existing per-organization
 * MCP clients and the single system-owned KrabiClaw legal-facade client.
 * A staff `super_admin` may create/read/update/rotate/delete any OAuth
 * client — this is how the KrabiClaw client is provisioned and rotated
 * (see scripts/provision-krabiclaw-oauth-client.ts). Every other session
 * falls through to the unchanged org-owner check.
 */
export const checkOAuthClientPrivileges = async (ctx: {
  headers: Headers;
  user?: { id: string; role?: string | null };
  session?: Record<string, unknown>;
}): Promise<boolean> => {
  if (getStaffRoles(ctx.user?.role).includes('super_admin')) {
    return true;
  }
  return checkClientIsOwner(ctx);
};
