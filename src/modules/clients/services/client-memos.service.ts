/**
 * Client Memos Service
 *
 * Handles client memo operations (CRUD)
 */

import { ForbiddenError } from '@casl/ability';
import { practiceClientMemosRepository } from '@/modules/clients/database/queries/practice-client-memos.queries';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import type { SelectPracticeClientMemo } from '@/modules/clients/database/schema/practice-client-memos.schema';
import type { ServiceContext } from '@/shared/types/service-context';

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
): Promise<SelectPracticeClientMemo> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'ClientMemo');

  const { clientId, data } = params;

  const client = await clientsRepository.findById(clientId);
  if (!client || client.organization_id !== ctx.organizationId) {
    throw new Error('Client not found');
  }

  const memo = await practiceClientMemosRepository.create({
    client_id: clientId,
    created_by: ctx.userId,
    content: data.content,
    event_time: data.event_time,
  });

  return memo;
};

/**
 * List client memos
 */
const listMemos = async (
  params: { clientId: string; limit?: number; offset?: number },
  ctx: ServiceContext
): Promise<{ data: SelectPracticeClientMemo[]; total: number }> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'ClientMemo');

  const client = await clientsRepository.findById(params.clientId);
  if (!client || client.organization_id !== ctx.organizationId) {
    throw new Error('Client not found');
  }

  const data = await practiceClientMemosRepository.listMemos(params);
  return data;
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
): Promise<SelectPracticeClientMemo> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'ClientMemo');

  const { id, clientId, data } = params;

  const client = await clientsRepository.findById(clientId);
  if (!client || client.organization_id !== ctx.organizationId) {
    throw new Error('Client not found');
  }

  const memo = await practiceClientMemosRepository.findById(id);
  if (!memo || memo.client_id !== clientId) {
    throw new Error('Memo not found');
  }

  const updated = await practiceClientMemosRepository.update(id, {
    content: data.content,
    event_time: data.event_time,
  });

  if (!updated) {
    throw new Error('Failed to update memo');
  }

  return updated;
};

/**
 * Delete a client memo
 */
const deleteMemo = async (params: { id: string; clientId: string }, ctx: ServiceContext): Promise<void> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', 'ClientMemo');

  const { id, clientId } = params;

  const client = await clientsRepository.findById(clientId);
  if (!client || client.organization_id !== ctx.organizationId) {
    throw new Error('Client not found');
  }

  const memo = await practiceClientMemosRepository.findById(id);
  if (!memo || memo.client_id !== clientId) {
    throw new Error('Memo not found');
  }

  await practiceClientMemosRepository.deleteMemo(id);
};

export const clientMemosService = {
  createMemo,
  listMemos,
  updateMemo,
  deleteMemo,
};
