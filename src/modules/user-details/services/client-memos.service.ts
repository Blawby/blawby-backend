import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { practiceClientMemosRepository } from '@/modules/user-details/database/queries/practice-client-memos.queries';
import { userDetailsRepository } from '@/modules/user-details/database/queries/user-details.queries';
import {
  type SelectPracticeClientMemo,
  type InsertPracticeClientMemo,
} from '@/modules/user-details/database/schema/practice-client-memos.schema';
import { toSubject } from '@/shared/auth/subject-helpers';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { ok, internalError, notFound, forbidden } from '@/shared/utils/result';

const logger = getLogger(['client-memos', 'service']);

const createMemo = async (
  params: {
    clientId: string;
    data: Omit<InsertPracticeClientMemo, 'client_id' | 'created_by'>;
  },
  ctx: ServiceContext
): Promise<Result<SelectPracticeClientMemo>> => {
  const { clientId, data } = params;
  try {
    const client = await userDetailsRepository.findById(clientId);
    if (!client || client.organization_id !== ctx.organizationId) {
      return notFound('Client not found');
    }

    const subject = toSubject('ClientMemo', { ...data, client_user_id: client.user_id });
    if (!ctx.ability.can('create', subject)) {
      return forbidden('Cannot create ClientMemo');
    }

    const memo = await practiceClientMemosRepository.create({
      ...data,
      client_id: clientId,
      created_by: ctx.userId,
    });

    return ok(memo);
  } catch (error) {
    logger.error('Failed to create memo for client {clientId}: {error}', { clientId, error });
    return internalError('Failed to create memo');
  }
};

const updateMemo = async (
  params: {
    id: string;
    clientId: string;
    data: Partial<InsertPracticeClientMemo>;
  },
  ctx: ServiceContext
): Promise<Result<SelectPracticeClientMemo>> => {
  const { id, clientId, data } = params;
  try {
    const memo = await practiceClientMemosRepository.findById(id);
    if (!memo || memo.client_id !== clientId) {
      return notFound('Memo not found');
    }

    const client = await userDetailsRepository.findById(clientId);
    if (!client || client.organization_id !== ctx.organizationId) {
      return notFound('Client not found');
    }

    ForbiddenError.from(ctx.ability).throwUnlessCan(
      'update',
      toSubject('ClientMemo', { ...memo, client_user_id: client.user_id })
    );

    const updated = await practiceClientMemosRepository.update(id, data);
    if (!updated) return internalError('Failed to update memo');

    return ok(updated);
  } catch (error) {
    if (error instanceof ForbiddenError) return forbidden(error.message);
    logger.error('Failed to update memo {id}: {error}', { id, error });
    return internalError('Failed to update memo');
  }
};

const deleteMemo = async (params: { id: string; clientId: string }, ctx: ServiceContext): Promise<Result<void>> => {
  const { id, clientId } = params;
  try {
    const memo = await practiceClientMemosRepository.findById(id);
    if (!memo || memo.client_id !== clientId) {
      return notFound('Memo not found');
    }

    const client = await userDetailsRepository.findById(clientId);
    if (!client || client.organization_id !== ctx.organizationId) {
      return notFound('Client not found');
    }

    ForbiddenError.from(ctx.ability).throwUnlessCan(
      'delete',
      toSubject('ClientMemo', { ...memo, client_user_id: client.user_id })
    );

    await practiceClientMemosRepository.delete(id);
    return ok(undefined);
  } catch (error) {
    if (error instanceof ForbiddenError) return forbidden(error.message);
    logger.error('Failed to delete memo {id}: {error}', { id, error });
    return internalError('Failed to delete memo');
  }
};

const listMemos = async (
  params: { clientId: string },
  ctx: ServiceContext
): Promise<Result<SelectPracticeClientMemo[]>> => {
  const { clientId } = params;
  try {
    const client = await userDetailsRepository.findById(clientId);
    if (!client || client.organization_id !== ctx.organizationId) {
      return notFound('Client not found');
    }

    ForbiddenError.from(ctx.ability).throwUnlessCan(
      'read',
      toSubject('ClientMemo', { client_user_id: client.user_id })
    );

    const memos = await practiceClientMemosRepository.listByClient(clientId);
    return ok(memos);
  } catch (error) {
    if (error instanceof ForbiddenError) return forbidden(error.message);
    logger.error('Failed to list memos for client {clientId}: {error}', { clientId, error });
    return internalError('Failed to list memos');
  }
};

export const clientMemosService = {
  createMemo,
  updateMemo,
  deleteMemo,
  listMemos,
};
