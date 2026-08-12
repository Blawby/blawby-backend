import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { krabiclawConnectOperationsRepository } from '@/modules/onboarding/database/queries/krabiclaw-connect-operations.repository';
import { krabiclawConnectOperations } from '@/modules/onboarding/schemas/krabiclaw-connect-operations.schema';
import { stripeConnectedAccounts } from '@/modules/onboarding/schemas/onboarding.schema';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';

const { createTestOrganization } = authHelpers;
const pendingUpdatedAt = new Date('2000-01-01T00:00:00.000Z');

const backdatePendingOperation = async (operationId: string): Promise<void> => {
  await getTestDb()
    .update(krabiclawConnectOperations)
    .set({ updated_at: pendingUpdatedAt })
    .where(eq(krabiclawConnectOperations.id, operationId));
};

const createConnectedAccount = async (organizationId: string): Promise<string> => {
  const [account] = await getTestDb()
    .insert(stripeConnectedAccounts)
    .values({
      organization_id: organizationId,
      stripe_account_id: `acct_${randomUUID()}`,
      email: `${randomUUID()}@example.test`,
    })
    .returning();
  return account.id;
};

describe('krabiclawConnectOperationsRepository', () => {
  it('creates a pending operation and finds it by request key', async () => {
    const org = await createTestOrganization();
    const requestKey = randomUUID();

    const created = await krabiclawConnectOperationsRepository.createPending({
      organization_id: org.id,
      request_key: requestKey,
    });

    expect(created.status).toBe('pending');

    const found = await krabiclawConnectOperationsRepository.findByRequestKey(org.id, requestKey);
    expect(found?.id).toBe(created.id);
  });

  it('recovers the same operation when the same request key is retried', async () => {
    const org = await createTestOrganization();
    const requestKey = randomUUID();

    const first = await krabiclawConnectOperationsRepository.createPending({
      organization_id: org.id,
      request_key: requestKey,
    });
    const second = await krabiclawConnectOperationsRepository.createPending({
      organization_id: org.id,
      request_key: requestKey,
    });

    expect(second.id).toBe(first.id);
  });

  it('marks an operation succeeded exactly once', async () => {
    const org = await createTestOrganization();
    const requestKey = randomUUID();
    const operation = await krabiclawConnectOperationsRepository.createPending({
      organization_id: org.id,
      request_key: requestKey,
    });

    const connectedAccountId = await createConnectedAccount(org.id);
    await backdatePendingOperation(operation.id);

    const succeeded = await krabiclawConnectOperationsRepository.markSucceeded(operation.id, connectedAccountId);
    expect(succeeded.status).toBe('succeeded');
    expect(succeeded.updated_at.getTime()).toBeGreaterThan(pendingUpdatedAt.getTime());

    await expect(krabiclawConnectOperationsRepository.markSucceeded(operation.id, connectedAccountId)).rejects.toThrow(
      'Connect operation is no longer pending'
    );
  });

  it('marks an operation failed exactly once', async () => {
    const org = await createTestOrganization();
    const requestKey = randomUUID();
    const operation = await krabiclawConnectOperationsRepository.createPending({
      organization_id: org.id,
      request_key: requestKey,
    });
    await backdatePendingOperation(operation.id);

    const failed = await krabiclawConnectOperationsRepository.markFailed(operation.id, 'stripe unavailable');
    expect(failed.status).toBe('failed');
    expect(failed.error_message).toBe('stripe unavailable');
    expect(failed.updated_at.getTime()).toBeGreaterThan(pendingUpdatedAt.getTime());

    await expect(krabiclawConnectOperationsRepository.markFailed(operation.id, 'stripe unavailable')).rejects.toThrow(
      'Connect operation is no longer pending'
    );
  });
});
