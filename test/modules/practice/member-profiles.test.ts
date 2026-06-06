import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';
import { createAuthenticatedRequest, createRequest } from '@/test/helpers/request';
import type { TestOrganization } from '@/test/types/shared';
import practiceApp from '@/modules/practice/http';
import { matterAssignees } from '@/modules/matters/database/schema/matter-assignees.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';

const { createTestContext } = authHelpers;

// Mirror the practice module middleware (routes.config: requireAuth + requireOrgMembership).
const orgProtectedApp = new Hono();
orgProtectedApp.use('/api/*', requireAuth());
orgProtectedApp.use('/api/*', requireOrgMembership());
orgProtectedApp.route('/api/practice', practiceApp);

const authedRequest = (sessionToken: string): ReturnType<typeof createAuthenticatedRequest> =>
  createAuthenticatedRequest(orgProtectedApp.fetch, sessionToken);
const anonRequest = createRequest(orgProtectedApp.fetch);

describe('member routing profile endpoints', () => {
  const db = getTestDb();
  let org: TestOrganization;
  let sessionToken = '';
  let userId = '';

  const profilePath = (): string => `/api/practice/${org.id}/members/${userId}/profile`;

  beforeAll(async () => {
    const ctx = await createTestContext('owner');
    org = ctx.org;
    sessionToken = ctx.sessionToken;
    if (!ctx.session?.user?.id) {
      throw new Error('missing test session user');
    }
    userId = ctx.session.user.id;
  });

  it('requires authentication', async () => {
    const res = await anonRequest.get(profilePath());
    expect(res.status).toBe(401);
  });

  it('returns 404 before a profile exists', async () => {
    const res = await authedRequest(sessionToken).get(profilePath());
    expect(res.status).toBe(404);
  });

  it('returns 404 for a user who is not a member of the org', async () => {
    const res = await authedRequest(sessionToken).get(
      `/api/practice/${org.id}/members/123e4567-e89b-12d3-a456-426614174999/profile`
    );
    expect(res.status).toBe(404);
  });

  it('creates the profile on PUT', async () => {
    const res = await authedRequest(sessionToken)
      .put(profilePath())
      .send({
        practice_areas: ['Family Law'],
        service_counties: ['Wake'],
        max_capacity: 10,
        accepting_clients: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.user_id).toBe(userId);
    expect(res.body.practice_areas).toEqual(['Family Law']);
    expect(res.body.service_counties).toEqual(['Wake']);
    expect(res.body.max_capacity).toBe(10);
    expect(res.body.accepting_clients).toBe(true);
    expect(res.body.current_matters).toBe(0);
  });

  it('returns the persisted profile on GET', async () => {
    const res = await authedRequest(sessionToken).get(profilePath());
    expect(res.status).toBe(200);
    expect(res.body.practice_areas).toEqual(['Family Law']);
    expect(res.body.max_capacity).toBe(10);
  });

  it('partial-merges: updating accepting_clients leaves other fields intact', async () => {
    const res = await authedRequest(sessionToken).put(profilePath()).send({ accepting_clients: false });
    expect(res.status).toBe(200);
    expect(res.body.accepting_clients).toBe(false);
    expect(res.body.practice_areas).toEqual(['Family Law']);
    expect(res.body.max_capacity).toBe(10);
  });

  it('clears max_capacity when set to null', async () => {
    const res = await authedRequest(sessionToken).put(profilePath()).send({ max_capacity: null });
    expect(res.status).toBe(200);
    expect(res.body.max_capacity).toBeNull();
  });

  it('computes current_matters from active assigned matters, excluding terminal ones', async () => {
    // Active matter where the member is the responsible attorney.
    await db.insert(matters).values({
      organization_id: org.id,
      title: 'Active as responsible',
      billing_type: 'hourly',
      status: 'active',
      responsible_attorney_id: userId,
    });

    // Active matter where the member is an explicit assignee.
    const [assigned] = await db
      .insert(matters)
      .values({ organization_id: org.id, title: 'Active as assignee', billing_type: 'hourly', status: 'discovery' })
      .returning();
    await db.insert(matterAssignees).values({ matter_id: assigned.id, user_id: userId });

    // Closed matter must NOT count toward the active caseload.
    await db.insert(matters).values({
      organization_id: org.id,
      title: 'Closed',
      billing_type: 'hourly',
      status: 'closed',
      responsible_attorney_id: userId,
    });

    const res = await authedRequest(sessionToken).get(profilePath());
    expect(res.status).toBe(200);
    expect(res.body.current_matters).toBe(2);
  });

  it('rejects a negative max_capacity', async () => {
    const res = await authedRequest(sessionToken).put(profilePath()).send({ max_capacity: -5 });
    expect(res.status).toBe(400);
  });
});
