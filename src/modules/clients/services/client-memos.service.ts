import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { practiceClientMemosRepository } from '@/modules/clients/database/queries/practice-client-memos.queries';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import type { SelectPracticeClientMemo } from '@/modules/clients/database/schema/practice-client-memos.schema';
import type { ServiceContext } from '@/shared/types/service-context';

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
): Promise<SelectPracticeClientMemo> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'ClientMemo');

  const { clientId, data } = params;

  try {
    const client = await clientsRepository.findById(clientId);
    if (!client || client.organization_id !== ctx.organizationId) {
      throw new HTTPException(404, { message: 'Client not found' });
    }

    const memo = await practiceClientMemosRepository.create({
      client_id: clientId,
      created_by: ctx.userId,
      content: data.content,
      event_time: data.event_time,
    });

    return memo;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to create client memo: {error}', { error, organizationId: ctx.organizationId });
    throw new HTTPException(500, { message: 'Failed to create client memo' });
  }
};

const listMemos = async (
  params: { clientId: string; limit?: number; offset?: number },
  ctx: ServiceContext
): Promise<{ data: SelectPracticeClientMemo[]; total: number }> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'ClientMemo');

  try {
    const client = await clientsRepository.findById(params.clientId);
    if (!client || client.organization_id !== ctx.organizationId) {
      throw new HTTPException(404, { message: 'Client not found' });
    }

    const data = await practiceClientMemosRepository.listMemos(params);
    return data;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to list client memos: {error}', { error, organizationId: ctx.organizationId });
    throw new HTTPException(500, { message: 'Failed to list client memos' });
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
): Promise<SelectPracticeClientMemo> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'ClientMemo');

  const { id, clientId, data } = params;

  try {
    const client = await clientsRepository.findById(clientId);
    if (!client || client.organization_id !== ctx.organizationId) {
      throw new HTTPException(404, { message: 'Client not found' });
    }

    const memo = await practiceClientMemosRepository.findById(id);
    if (!memo || memo.client_id !== clientId) {
      throw new HTTPException(404, { message: 'Memo not found' });
    }

    const updated = await practiceClientMemosRepository.update(id, {
      content: data.content,
      event_time: data.event_time,
    });

    if (!updated) {
      throw new HTTPException(500, { message: 'Failed to update memo' });
    }

    return updated;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to update client memo {id}: {error}', { id, error, organizationId: ctx.organizationId });
    throw new HTTPException(500, { message: 'Failed to update client memo' });
  }
};

const deleteMemo = async (params: { id: string; clientId: string }, ctx: ServiceContext): Promise<void> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', 'ClientMemo');

  const { id, clientId } = params;

  try {
    const client = await clientsRepository.findById(clientId);
    if (!client || client.organization_id !== ctx.organizationId) {
      throw new HTTPException(404, { message: 'Client not found' });
    }

    const memo = await practiceClientMemosRepository.findById(id);
    if (!memo || memo.client_id !== clientId) {
      throw new HTTPException(404, { message: 'Memo not found' });
    }

    await practiceClientMemosRepository.deleteMemo(id);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to delete client memo {id}: {error}', { id, error, organizationId: ctx.organizationId });
    throw new HTTPException(500, { message: 'Failed to delete client memo' });
  }
};

export const clientMemosService = {
  createMemo,
  listMemos,
  updateMemo,
  deleteMemo,
};
