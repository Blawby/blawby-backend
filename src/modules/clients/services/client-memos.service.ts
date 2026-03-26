import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { practiceClientMemosRepository } from '@/modules/clients/database/queries/practice-client-memos.queries';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import type { SelectPracticeClientMemo } from '@/modules/clients/database/schema/practice-client-memos.schema';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { ok, internalError, notFound } from '@/shared/utils/result';

const logger = getLogger(['clients', 'memos-service']);

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
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'ClientMemo');

  const { clientId, data } = params;

  try {
    const client = await clientsRepository.findById(clientId);
    if (!client || client.organization_id !== ctx.organizationId) {
      return notFound('Client not found');
    }

    const memo = await practiceClientMemosRepository.create({
      client_id: clientId,
      created_by: ctx.userId,
      content: data.content,
      event_time: data.event_time,
    });

    return ok(memo);
  } catch (error) {
    logger.error('Failed to create client memo: {error}', { error, organizationId: ctx.organizationId });
    return internalError('Failed to create client memo');
  }
};

const listMemos = async (
  params: { clientId: string; limit?: number; offset?: number },
  ctx: ServiceContext
): Promise<Result<{ data: SelectPracticeClientMemo[]; total: number }>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'ClientMemo');

  try {
    const client = await clientsRepository.findById(params.clientId);
    if (!client || client.organization_id !== ctx.organizationId) {
      return notFound('Client not found');
    }

    const data = await practiceClientMemosRepository.listMemos(params);
    return ok(data);
  } catch (error) {
    logger.error('Failed to list client memos: {error}', { error, organizationId: ctx.organizationId });
    return internalError('Failed to list client memos');
  }
};

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
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'ClientMemo');

  const { id, clientId, data } = params;

  try {
    const client = await clientsRepository.findById(clientId);
    if (!client || client.organization_id !== ctx.organizationId) {
      return notFound('Client not found');
    }

    const memo = await practiceClientMemosRepository.findById(id);
    if (!memo) {
      return notFound('Memo not found');
    }

    const updated = await practiceClientMemosRepository.update(id, {
      content: data.content,
      event_time: data.event_time,
    });

    if (!updated) {
      return internalError('Failed to update memo');
    }

    return ok(updated);
  } catch (error) {
    logger.error('Failed to update client memo {id}: {error}', { id, error, organizationId: ctx.organizationId });
    return internalError('Failed to update client memo');
  }
};

const deleteMemo = async (params: { id: string; clientId: string }, ctx: ServiceContext): Promise<Result<void>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', 'ClientMemo');

  const { id, clientId } = params;

  try {
    const client = await clientsRepository.findById(clientId);
    if (!client || client.organization_id !== ctx.organizationId) {
      return notFound('Client not found');
    }

    const memo = await practiceClientMemosRepository.findById(id);
    if (!memo) {
      return notFound('Memo not found');
    }

    await practiceClientMemosRepository.deleteMemo(id);
    return ok(undefined);
  } catch (error) {
    logger.error('Failed to delete client memo {id}: {error}', { id, error, organizationId: ctx.organizationId });
    return internalError('Failed to delete client memo');
  }
};

export const clientMemosService = {
  createMemo,
  listMemos,
  updateMemo,
  deleteMemo,
};
