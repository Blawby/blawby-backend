/**
 * Client Memos Service
 *
 * Handles client memo operations (CRUD)
 */

import { practiceClientMemosRepository } from '@/modules/clients/database/queries/practice-client-memos.queries';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import type { SelectPracticeClientMemo } from '@/modules/clients/database/schema/practice-client-memos.schema';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

/**
 * Create a client memo
 */
const createMemo = async (
  params: {
    clientId: string;
    data: {
      content: string;
      event_time?: Date;
    };
  },
  ctx: ServiceContext
): Promise<Result<SelectPracticeClientMemo>> => {
  if (ctx.ability.cannot('create', 'ClientMemo')) {
    return result.forbidden('You do not have permission to create client memos');
  }

  const { clientId, data } = params;

  const client = await clientsRepository.findById(clientId);
  if (!client || client.organization_id !== ctx.organizationId) {
    return result.notFound('Client not found');
  }

  try {
    const memo = await practiceClientMemosRepository.create({
      client_id: clientId,
      created_by: ctx.userId,
      content: data.content,
      event_time: data.event_time,
    });

    return result.ok(memo);
  } catch {
    return result.internalError('Failed to create client memo');
  }
};

/**
 * List client memos
 */
const listMemos = async (
  params: { clientId: string; limit?: number; offset?: number },
  ctx: ServiceContext
): Promise<Result<{ data: SelectPracticeClientMemo[]; total: number }>> => {
  if (ctx.ability.cannot('read', 'ClientMemo')) {
    return result.forbidden('You do not have permission to read client memos');
  }

  const client = await clientsRepository.findById(params.clientId);
  if (!client || client.organization_id !== ctx.organizationId) {
    return result.notFound('Client not found');
  }

  try {
    const data = await practiceClientMemosRepository.listMemos(params);
    return result.ok(data);
  } catch {
    return result.internalError('Failed to list client memos');
  }
};

/**
 * Update a client memo
 */
const updateMemo = async (
  params: {
    id: string;
    clientId: string;
    data: {
      content?: string;
      event_time?: Date;
    };
  },
  ctx: ServiceContext
): Promise<Result<SelectPracticeClientMemo>> => {
  if (ctx.ability.cannot('update', 'ClientMemo')) {
    return result.forbidden('You do not have permission to update client memos');
  }

  const { id, clientId, data } = params;

  const client = await clientsRepository.findById(clientId);
  if (!client || client.organization_id !== ctx.organizationId) {
    return result.notFound('Client not found');
  }

  const memo = await practiceClientMemosRepository.findById(id);
  if (!memo || memo.client_id !== clientId) {
    return result.notFound('Memo not found');
  }

  try {
    const updated = await practiceClientMemosRepository.update(id, {
      content: data.content,
      event_time: data.event_time,
    });

    if (!updated) {
      return result.internalError('Failed to update memo');
    }

    return result.ok(updated);
  } catch {
    return result.internalError('Failed to update client memo');
  }
};

/**
 * Delete a client memo
 */
const deleteMemo = async (params: { id: string; clientId: string }, ctx: ServiceContext): Promise<Result<void>> => {
  if (ctx.ability.cannot('delete', 'ClientMemo')) {
    return result.forbidden('You do not have permission to delete client memos');
  }

  const { id, clientId } = params;

  const client = await clientsRepository.findById(clientId);
  if (!client || client.organization_id !== ctx.organizationId) {
    return result.notFound('Client not found');
  }

  const memo = await practiceClientMemosRepository.findById(id);
  if (!memo || memo.client_id !== clientId) {
    return result.notFound('Memo not found');
  }

  try {
    await practiceClientMemosRepository.deleteMemo(id);
    return result.ok(undefined);
  } catch {
    return result.internalError('Failed to delete client memo');
  }
};

export const clientMemosService = {
  createMemo,
  listMemos,
  updateMemo,
  deleteMemo,
};
