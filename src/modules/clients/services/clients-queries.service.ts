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
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

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
): Promise<
  Result<{
    data: (SelectClient & { user: typeof users.$inferSelect | null; address: Address | null })[];
    total: number;
  }>
> => {
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
    return result.forbidden('You do not have permission to view clients');
  }

  try {
    const data = await clientsRepository.listClients({
      ...params,
      clientId: effectiveClientId,
      organizationId: ctx.organizationId,
    });
    return result.ok(data);
  } catch {
    return result.internalError('Failed to list clients');
  }
};

/**
 * Get a single client by ID
 */
const getClient = async (params: { id: string }, ctx: ServiceContext): Promise<Result<SelectClient>> => {
  const { id } = params;

  const detail = await clientsRepository.findById(id);
  if (!detail || detail.organization_id !== ctx.organizationId) {
    return result.notFound('Client not found');
  }

  if (!ctx.ability.can('read', 'Client')) {
    if (ctx.ability.cannot('read', toSubject('Client', detail))) {
      return result.forbidden('You do not have permission to view this client');
    }
  }

  return result.ok(detail);
};

export const clientsQueriesService = {
  listClients,
  getClient,
};
