import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { Hono } from 'hono';

import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';
import { createAuthenticatedRequest, createRequest } from '@/test/helpers/request';
import type { TestOrganization } from '@/test/types/shared';
import { toTypedResponse } from '@/test/helpers/response';
import trustApp from '@/modules/trust/http';
import { clients } from '@/modules/clients/database/schema/clients.schema';
import { trustTransactions } from '@/modules/trust/database/schema/trust-transactions.schema';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import type { SelectTrustTransaction } from '@/modules/trust/database/schema/trust-transactions.schema';

const { createTestContext } = authHelpers;

const orgProtectedApp = new Hono();
orgProtectedApp.use('/api/*', requireAuth());
orgProtectedApp.use('/api/*', requireOrgMembership());
orgProtectedApp.route('/api/trust', trustApp);

const orgProtectedRequest = createRequest(orgProtectedApp.fetch);

const authedRequest = (sessionToken: string): ReturnType<typeof createAuthenticatedRequest> =>
  createAuthenticatedRequest(orgProtectedApp.fetch, sessionToken);

const insertClient = async (orgId: string, name: string) => {
  const db = getTestDb();
  const [client] = await db
    .insert(clients)
    .values({
      organization_id: orgId,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '-')}-${randomUUID().slice(0, 8)}@test.example`,
      status: 'active',
    })
    .returning();
  return client;
};

const insertTrustTransaction = async (params: {
  orgId: string;
  clientId: string;
  amount: number;
  balanceAfter: number;
  createdBy: string;
  createdAt?: Date;
}): Promise<SelectTrustTransaction> => {
  const db = getTestDb();
  const [row] = await db
    .insert(trustTransactions)
    .values({
      organization_id: params.orgId,
      client_id: params.clientId,
      transaction_type: 'deposit',
      amount: params.amount,
      balance_after: params.balanceAfter,
      created_by: params.createdBy,
      ...(params.createdAt && { created_at: params.createdAt }),
    })
    .returning();
  return row;
};

describe('Trust reports endpoints', () => {
  let sessionToken = '';
  let org: TestOrganization = { id: '', name: '', slug: '' };
  let session: { user: { id: string } } | null = null;
  let clientAId = '';
  let clientBId = '';

  beforeAll(async () => {
    const ctx = await createTestContext('owner');
    org = ctx.org;
    sessionToken = ctx.sessionToken;
    session = ctx.session as { user: { id: string } } | null;
    const userId = session!.user.id;

    const clientA = await insertClient(org.id, 'Client A');
    const clientB = await insertClient(org.id, 'Client B');
    clientAId = clientA.id;
    clientBId = clientB.id;

    // Client A: two deposits, latest balance 1500
    await insertTrustTransaction({
      orgId: org.id,
      clientId: clientAId,
      amount: 1000,
      balanceAfter: 1000,
      createdBy: userId,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    await insertTrustTransaction({
      orgId: org.id,
      clientId: clientAId,
      amount: 500,
      balanceAfter: 1500,
      createdBy: userId,
      createdAt: new Date('2026-02-01T00:00:00Z'),
    });

    // Client B: one deposit, latest balance 2500
    await insertTrustTransaction({
      orgId: org.id,
      clientId: clientBId,
      amount: 2500,
      balanceAfter: 2500,
      createdBy: userId,
      createdAt: new Date('2026-03-01T00:00:00Z'),
    });
  });

  it('GET /{practice_id}/transactions returns org-wide transactions without client_id, ordered by created_at DESC', async () => {
    const res = await toTypedResponse<SelectTrustTransaction[]>(
      authedRequest(sessionToken).get(`/api/trust/${org.id}/transactions`)
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(3);

    // All belong to the org
    expect(res.body.every((t) => t.organization_id === org.id)).toBe(true);

    // Includes both clients
    const clientIds = new Set(res.body.map((t) => t.client_id));
    expect(clientIds.has(clientAId)).toBe(true);
    expect(clientIds.has(clientBId)).toBe(true);

    // Ordered by created_at DESC
    const timestamps = res.body.map((t) => new Date(t.created_at).getTime());
    const sorted = [...timestamps].sort((a, b) => b - a);
    expect(timestamps).toEqual(sorted);
  });

  it('GET /{practice_id}/client-balances returns one row per client with their latest balance_after', async () => {
    interface ClientBalanceRow {
      client_id: string;
      balance: number;
      as_of_date: string;
    }

    const res = await toTypedResponse<ClientBalanceRow[]>(
      authedRequest(sessionToken).get(`/api/trust/${org.id}/client-balances`)
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);

    const byClient = new Map(res.body.map((r) => [r.client_id, r]));
    expect(byClient.get(clientAId)?.balance).toBe(1500);
    expect(byClient.get(clientBId)?.balance).toBe(2500);

    // as_of_date is present and matches the most recent transaction timestamp
    expect(new Date(byClient.get(clientAId)!.as_of_date).toISOString()).toBe(new Date('2026-02-01T00:00:00Z').toISOString());
    expect(new Date(byClient.get(clientBId)!.as_of_date).toISOString()).toBe(new Date('2026-03-01T00:00:00Z').toISOString());
  });

  it('GET /{practice_id}/client-balances returns 401 for unauthenticated request', async () => {
    const res = await orgProtectedRequest.get(`/api/trust/${org.id}/client-balances`);
    expect(res.status).toBe(401);
  });
});
