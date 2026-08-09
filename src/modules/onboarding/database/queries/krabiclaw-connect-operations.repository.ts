import { and, eq } from 'drizzle-orm';

import {
  krabiclawConnectOperations,
  type InsertKrabiClawConnectOperation,
  type SelectKrabiClawConnectOperation,
} from '@/modules/onboarding/schemas/krabiclaw-connect-operations.schema';
import { getActiveTx } from '@/shared/database/uow';

const findByRequestKey = async (
  organizationId: string,
  requestKey: string
): Promise<SelectKrabiClawConnectOperation | undefined> => {
  const [operation] = await getActiveTx()
    .select()
    .from(krabiclawConnectOperations)
    .where(
      and(
        eq(krabiclawConnectOperations.organization_id, organizationId),
        eq(krabiclawConnectOperations.request_key, requestKey)
      )
    )
    .limit(1);
  return operation;
};

const createPending = async (
  data: Pick<InsertKrabiClawConnectOperation, 'organization_id' | 'request_key'>
): Promise<SelectKrabiClawConnectOperation> => {
  const [operation] = await getActiveTx()
    .insert(krabiclawConnectOperations)
    .values(data)
    .onConflictDoNothing({
      target: [krabiclawConnectOperations.organization_id, krabiclawConnectOperations.request_key],
    })
    .returning();
  if (operation) {
    return operation;
  }

  const existing = await findByRequestKey(data.organization_id, data.request_key);
  if (!existing) {
    throw new Error('Failed to create krabiclaw connect operation');
  }
  return existing;
};

const markSucceeded = async (id: string, connectedAccountId: string): Promise<SelectKrabiClawConnectOperation> => {
  const [operation] = await getActiveTx()
    .update(krabiclawConnectOperations)
    .set({ status: 'succeeded', connected_account_id: connectedAccountId, error_message: null })
    .where(and(eq(krabiclawConnectOperations.id, id), eq(krabiclawConnectOperations.status, 'pending')))
    .returning();
  if (!operation) {
    throw new Error('Connect operation is no longer pending');
  }
  return operation;
};

const markFailed = async (id: string, errorMessage: string): Promise<SelectKrabiClawConnectOperation> => {
  const [operation] = await getActiveTx()
    .update(krabiclawConnectOperations)
    .set({ status: 'failed', error_message: errorMessage })
    .where(and(eq(krabiclawConnectOperations.id, id), eq(krabiclawConnectOperations.status, 'pending')))
    .returning();
  if (!operation) {
    throw new Error('Connect operation is no longer pending');
  }
  return operation;
};

export const krabiclawConnectOperationsRepository = {
  findByRequestKey,
  createPending,
  markSucceeded,
  markFailed,
};
