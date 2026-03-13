import { getLogger } from '@logtape/logtape';
import { practiceClientMemosRepository } from '@/modules/user-details/database/queries/practice-client-memos.queries';
import { userDetailsRepository } from '@/modules/user-details/database/queries/user-details.queries';
import {
  type SelectPracticeClientMemo,
  type InsertPracticeClientMemo,
} from '@/modules/user-details/database/schema/practice-client-memos.schema';
import type { Result } from '@/shared/types/result';
import { ok, internalError, notFound } from '@/shared/utils/result';

const logger = getLogger(['client-memos', 'service']);

const createMemo = async (
  clientId: string,
  organizationId: string,
  data: Omit<InsertPracticeClientMemo, 'client_id' | 'created_by'>,
  userId: string
): Promise<Result<SelectPracticeClientMemo>> => {
  try {
    const client = await userDetailsRepository.findById(clientId);
    if (!client || client.organization_id !== organizationId) {
      return notFound('Client not found');
    }

    const memo = await practiceClientMemosRepository.create({
      ...data,
      client_id: clientId,
      created_by: userId,
    });

    return ok(memo);
  } catch (error) {
    logger.error('Failed to create memo for client {clientId}: {error}', { clientId, error });
    return internalError('Failed to create memo');
  }
};

const updateMemo = async (
  id: string,
  clientId: string,
  organizationId: string,
  data: Partial<InsertPracticeClientMemo>
): Promise<Result<SelectPracticeClientMemo>> => {
  try {
    const memo = await practiceClientMemosRepository.findById(id);
    if (!memo || memo.client_id !== clientId) {
      return notFound('Memo not found');
    }

    const client = await userDetailsRepository.findById(clientId);
    if (!client || client.organization_id !== organizationId) {
      return notFound('Client not found');
    }

    const updated = await practiceClientMemosRepository.update(id, data);
    if (!updated) return internalError('Failed to update memo');

    return ok(updated);
  } catch (error) {
    logger.error('Failed to update memo {id}: {error}', { id, error });
    return internalError('Failed to update memo');
  }
};

const deleteMemo = async (id: string, clientId: string, organizationId: string): Promise<Result<void>> => {
  try {
    const memo = await practiceClientMemosRepository.findById(id);
    if (!memo || memo.client_id !== clientId) {
      return notFound('Memo not found');
    }

    const client = await userDetailsRepository.findById(clientId);
    if (!client || client.organization_id !== organizationId) {
      return notFound('Client not found');
    }

    await practiceClientMemosRepository.delete(id);
    return ok(undefined);
  } catch (error) {
    logger.error('Failed to delete memo {id}: {error}', { id, error });
    return internalError('Failed to delete memo');
  }
};

const listMemos = async (clientId: string, organizationId: string): Promise<Result<SelectPracticeClientMemo[]>> => {
  try {
    const client = await userDetailsRepository.findById(clientId);
    if (!client || client.organization_id !== organizationId) {
      return notFound('Client not found');
    }

    const memos = await practiceClientMemosRepository.listByClient(clientId);
    return ok(memos);
  } catch (error) {
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
