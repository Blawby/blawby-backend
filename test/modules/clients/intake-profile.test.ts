import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';
import { createAuthenticatedRequest, createRequest } from '@/test/helpers/request';
import type { TestOrganization } from '@/test/types/shared';
import clientsApp from '@/modules/clients/http';
import { clients } from '@/modules/clients/database/schema/clients.schema';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';

const { createTestContext, createTestOrganization } = authHelpers;

// Mirror the clients module middleware (routes.config: requireAuth + requireOrgMembership).
const orgProtectedApp = new Hono();
orgProtectedApp.use('/api/*', requireAuth());
orgProtectedApp.use('/api/*', requireOrgMembership());
orgProtectedApp.route('/api/clients', clientsApp);

const authedRequest = (sessionToken: string): ReturnType<typeof createAuthenticatedRequest> =>
  createAuthenticatedRequest(orgProtectedApp.fetch, sessionToken);
const anonRequest = createRequest(orgProtectedApp.fetch);

describe('client intake profile endpoints', () => {
  const db = getTestDb();
  let org: TestOrganization;
  let sessionToken = '';
  let clientId = '';

  const profilePath = (): string => `/api/clients/${org.id}/${clientId}/intake-profile`;

  beforeAll(async () => {
    ({ org, sessionToken } = await createTestContext('owner'));

    const [client] = await db
      .insert(clients)
      .values({ organization_id: org.id, name: 'Test Client', email: 'intake-client@example.com', status: 'active' })
      .returning();
    clientId = client.id;
  });

  it('returns 404 before a profile exists', async () => {
    const res = await authedRequest(sessionToken).get(profilePath());
    expect(res.status).toBe(404);
  });

  it('creates the profile on PUT with a percent_off discount', async () => {
    const res = await authedRequest(sessionToken).put(profilePath()).send({
      date_of_birth: '1990-04-15',
      preferred_contact_method: 'text',
      referral_source: 'Google',
      eligibility_status: 'eligible',
      percent_off: 12.5,
      discount_note: 'VIP referral',
    });

    expect(res.status).toBe(200);
    expect(res.body.client_id).toBe(clientId);
    expect(res.body.date_of_birth).toBe('1990-04-15');
    expect(res.body.eligibility_status).toBe('eligible');
    expect(res.body.percent_off).toBe(12.5);
    expect(res.body.amount_off).toBeNull();
    expect(res.body.currency).toBeNull();
  });

  it('returns the persisted profile on GET', async () => {
    const res = await authedRequest(sessionToken).get(profilePath());
    expect(res.status).toBe(200);
    expect(res.body.referral_source).toBe('Google');
    expect(res.body.preferred_contact_method).toBe('text');
    expect(res.body.percent_off).toBe(12.5);
  });

  it('partial-merges: updating eligibility leaves the discount and other fields intact', async () => {
    const res = await authedRequest(sessionToken).put(profilePath()).send({ eligibility_status: 'ineligible' });
    expect(res.status).toBe(200);
    expect(res.body.eligibility_status).toBe('ineligible');
    expect(res.body.percent_off).toBe(12.5);
    expect(res.body.referral_source).toBe('Google');
  });

  it('switches the discount to amount_off and clears percent_off', async () => {
    const res = await authedRequest(sessionToken).put(profilePath()).send({ amount_off: 5000, currency: 'usd' });
    expect(res.status).toBe(200);
    expect(res.body.amount_off).toBe(5000);
    expect(res.body.currency).toBe('usd');
    expect(res.body.percent_off).toBeNull();
  });

  it('clears the discount when all discount fields are null', async () => {
    const res = await authedRequest(sessionToken)
      .put(profilePath())
      .send({ amount_off: null, percent_off: null, currency: null });
    expect(res.status).toBe(200);
    expect(res.body.amount_off).toBeNull();
    expect(res.body.percent_off).toBeNull();
    expect(res.body.currency).toBeNull();
  });

  it('rejects amount_off without currency', async () => {
    const res = await authedRequest(sessionToken).put(profilePath()).send({ amount_off: 5000 });
    expect(res.status).toBe(400);
  });

  it('rejects setting both amount_off and percent_off', async () => {
    const res = await authedRequest(sessionToken)
      .put(profilePath())
      .send({ amount_off: 5000, currency: 'usd', percent_off: 10 });
    expect(res.status).toBe(400);
  });

  it('isolates by organization: a client in another org is not found', async () => {
    const otherOrg = await createTestOrganization();
    const [otherClient] = await db
      .insert(clients)
      .values({ organization_id: otherOrg.id, name: 'Other', email: 'other@example.com', status: 'active' })
      .returning();

    const res = await authedRequest(sessionToken).get(
      `/api/clients/${otherOrg.id}/${otherClient.id}/intake-profile`
    );
    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    const res = await anonRequest.get(profilePath());
    expect(res.status).toBe(401);
  });
});
