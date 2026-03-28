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
import type { Action, SubjectName } from '@/shared/auth/abilities';

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
  return rules.some((rule) => {
    return rule.action === 'read' && rule.subject === 'Client' && !rule.conditions && !rule.inverted;
  });
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
): Promise<
  Result<{
    data: (SelectClient & { user: typeof users.$inferSelect | null; address: Address | null })[];
    total: number;
  }>
> => {
  let effectiveClientId: string | undefined = params.clientId;

  if (hasUnrestrictedClientRead(ctx)) {
    // Admin/Member can list all or filter by clientId
  } else if (ctx.ability.can('read', toSubject('Client', { user_id: ctx.userId }))) {
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

  if (!hasUnrestrictedClientRead(ctx)) {
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
