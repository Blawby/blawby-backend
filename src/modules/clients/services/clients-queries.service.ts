/**
 * Client Queries Service
 *
 * Handles read operations for clients (get, list)
 */

import { type SelectClient } from '@/modules/clients/database/schema/clients.schema';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import type { Address } from '@/modules/practice/database/schema/addresses.schema';
import type { users } from '@/schema/better-auth-schema';
import { toSubject } from '@/shared/auth/subject-helpers';
import type { ServiceContext } from '@/shared/types/service-context';
import type { Action, SubjectName } from '@/shared/auth/abilities';
import { HTTPException } from 'hono/http-exception';

/**
 * Type-safe rule for rule inspection
 */
interface BaseRule {
  action: Action;
  subject: SubjectName;
  conditions?: Record<string, unknown>;
  inverted?: boolean;
}

/**
 * Helper to check for unconditional 'read' rule on 'Client'
 */
const hasUnrestrictedClientRead = (ctx: ServiceContext): boolean => {
  const rules = ctx.ability.rules as unknown as BaseRule[];
  return rules.some(
    (rule) => rule.action === 'read' && rule.subject === 'Client' && !rule.conditions && !rule.inverted
  );
};

/**
 * List clients with filtering and pagination
 */
const listClients = async (
  params: {
    clientId?: string;
    search?: string;
    status?: string;
    limit?: number;
    offset?: number;
  },
  ctx: ServiceContext
): Promise<{
  data: (SelectClient & { user: typeof users.$inferSelect | null; address: Address | null })[];
  total: number;
}> => {
  let effectiveClientId: string | undefined = params.clientId;

  if (hasUnrestrictedClientRead(ctx)) {
    // Admin/Member can list all or filter by clientId
  } else if (ctx.ability.can('read', toSubject('Client', { user_id: ctx.userId }))) {
    // Client can ONLY see their own record
    effectiveClientId = ctx.userId;
  } else {
    throw new HTTPException(403, { message: 'You do not have permission to view clients' });
  }

  const data = await clientsRepository.listClients({
    ...params,
    clientId: effectiveClientId,
    organizationId: ctx.organizationId,
  });
  return data;
};

/**
 * Get a single client by ID
 */
const getClient = async (params: { id: string }, ctx: ServiceContext): Promise<SelectClient> => {
  const { id } = params;

  const detail = await clientsRepository.findById(id);
  if (!detail || detail.organization_id !== ctx.organizationId) {
    throw new HTTPException(404, { message: 'Client not found' });
  }

  if (!hasUnrestrictedClientRead(ctx)) {
    if (ctx.ability.cannot('read', toSubject('Client', detail))) {
      throw new HTTPException(403, { message: 'You do not have permission to view this client' });
    }
  }

  return detail;
};

export const clientsQueriesService = {
  listClients,
  getClient,
};
