import { clients } from '@/modules/clients/database/schema/clients.schema';
import clientsApp from '@/modules/clients/http';
import { members } from '@/schema/better-auth-schema';
import { authHelpers } from '@/test/helpers/auth';
import { createAuthenticatedRequest, createRequest } from '@/test/helpers/request';
import type { TestOrganization, TestUser } from '@/test/types/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { getTestDb } from '@/test/helpers/db';

const { createTestContext, createTestOrganization, createTestUser } = authHelpers;

const testApp = new Hono();
testApp.route('/api/clients', clientsApp);

const authedRequest = (sessionToken: string): ReturnType<typeof createAuthenticatedRequest> =>
  createAuthenticatedRequest(testApp.fetch, sessionToken);
const anonRequest = createRequest(testApp.fetch);

describe('create client endpoint', () => {
  const db = getTestDb();
  let org: TestOrganization;
  let sessionToken = '';
  let clientUser: TestUser;

  beforeAll(async () => {
    ({ org, sessionToken } = await createTestContext('owner'));
    clientUser = await createTestUser({ name: 'Billing Client' });
  });

  const path = (): string => `/api/clients/${org.id}`;
  const body = (): { name: string; email: string; status: 'active' } => ({
    name: clientUser.name,
    email: clientUser.email,
    status: 'active',
  });

  it('links an existing user as a practice client', async () => {
    const res = await authedRequest(sessionToken).post(path()).send(body());

    expect(res.status).toBe(201);
    expect(res.body.organization_id).toBe(org.id);
    expect(res.body.user_id).toBe(clientUser.id);
    expect(res.body.email).toBe(clientUser.email);

    const [member] = await db
      .select()
      .from(members)
      .where(and(eq(members.organizationId, org.id), eq(members.userId, clientUser.id)));
    expect(member?.role).toBe('client');
  });

  it('is idempotent for the same practice and user', async () => {
    const first = await authedRequest(sessionToken).post(path()).send(body());
    const second = await authedRequest(sessionToken).post(path()).send(body());

    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);

    const records = await db
      .select()
      .from(clients)
      .where(and(eq(clients.organization_id, org.id), eq(clients.user_id, clientUser.id)));
    expect(records).toHaveLength(1);
  });

  it('rejects cross-practice creation', async () => {
    const otherOrg = await createTestOrganization();
    const res = await authedRequest(sessionToken).post(`/api/clients/${otherOrg.id}`).send(body());

    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await anonRequest.post(path()).send(body());
    expect(res.status).toBe(401);
  });
});
