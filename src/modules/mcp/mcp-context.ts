import { getLogger } from '@logtape/logtape';
import { and, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { McpJwt as JWTPayload } from '@/modules/mcp/types';

import { members } from '@/schema/better-auth-schema';
import { defineAbilityFor } from '@/shared/auth/abilities';
import { db } from '@/shared/database';
import { createServiceContext } from '@/shared/types/service-context';
import type { ServiceContext } from '@/shared/types/service-context';
import type { User } from '@/shared/types/BetterAuth';

const logger = getLogger(['mcp', 'context']);

export const getMcpScopes = (jwt: JWTPayload): string[] => {
  const scope = jwt['scope'];
  if (typeof scope !== 'string' || !scope.trim()) return [];
  return scope.trim().split(/\s+/);
};

export const buildMcpServiceContext = async (jwt: JWTPayload): Promise<ServiceContext> => {
  const userId = jwt.sub;
  const organizationId = jwt['organization_id'];

  if (!userId || typeof userId !== 'string') {
    throw new HTTPException(401, { message: 'Missing user identity in token' });
  }
  if (!organizationId || typeof organizationId !== 'string') {
    throw new HTTPException(401, { message: 'Missing organization_id in token' });
  }

  const [member] = await db
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.userId, userId), eq(members.organizationId, organizationId)))
    .limit(1);

  if (!member) {
    logger.warn('MCP token holder not a member of org: {userId} {organizationId}', { userId, organizationId });
    throw new HTTPException(403, { message: 'Not a member of this organization' });
  }

  const ability = defineAbilityFor(member.role, { userId, organizationId });

  const user = { id: userId, email: '', name: '' } as unknown as User;

  return createServiceContext({
    userId,
    user,
    organizationId,
    memberRole: member.role,
    ability,
    requestHeaders: {},
  });
};
