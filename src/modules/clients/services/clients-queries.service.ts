/**
 * Client Queries Service
 *
 * Handles read operations for clients (get, list)
 */

import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import type { SelectClient } from '@/modules/clients/database/schema/clients.schema';
import type { Address } from '@/modules/practice/database/schema/addresses.schema';
import type { users } from '@/schema/better-auth-schema';
import { toSubject } from '@/shared/auth/subject-helpers';
import type { ServiceContext } from '@/shared/types/service-context';
import { ForbiddenError } from '@casl/ability';

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

  if (ctx.ability.can('read', 'Client')) {
    // Admin/Member can list all or filter by clientId
  } else if (
    !ctx.ability.can('read', 'Client') &&
    ctx.ability.can('read', toSubject('Client', { user_id: ctx.userId }))
  ) {
    // Client can ONLY see their own record
    effectiveClientId = ctx.userId;
  } else {
    const forbiddenError = ForbiddenError.from(ctx.ability);
    forbiddenError.setMessage('You do not have permission to view clients');
    throw forbiddenError;
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
    throw new Error('Client not found');
  }

  if (!ctx.ability.can('read', 'Client')) {
    const forbiddenError = ForbiddenError.from(ctx.ability);
    forbiddenError.setMessage('You do not have permission to view this client');
    forbiddenError.throwUnlessCan('read', toSubject('Client', detail));
  }

  return detail;
};

export const clientsQueriesService = {
  listClients,
  getClient,
};
