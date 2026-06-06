import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { Hono } from 'hono';

import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';
import { createAuthenticatedRequest, createRequest } from '@/test/helpers/request';
import type { TestOrganization } from '@/test/types/shared';
import { toTypedResponse } from '@/test/helpers/response';
import mattersApp from '@/modules/matters/http';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { matterTasks } from '@/modules/matters/database/schema/matter-tasks.schema';
import { matterTimeEntries } from '@/modules/matters/database/schema/matter-time-entries.schema';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import type { SelectMatter } from '@/modules/matters/database/schema/matters.schema';
import type { SelectMatterTask } from '@/modules/matters/database/schema/matter-tasks.schema';
import type { SelectMatterTimeEntry } from '@/modules/matters/database/schema/matter-time-entries.schema';

const { createTestContext, createTestUser, addUserToOrganization } = authHelpers;

const orgProtectedApp = new Hono();
orgProtectedApp.use('/api/*', requireAuth());
orgProtectedApp.use('/api/*', requireOrgMembership());
orgProtectedApp.route('/api/matters', mattersApp);

const orgProtectedRequest = createRequest(orgProtectedApp.fetch);

const authedRequest = (sessionToken: string): ReturnType<typeof createAuthenticatedRequest> =>
  createAuthenticatedRequest(orgProtectedApp.fetch, sessionToken);

interface InsertMatterParams {
  orgId: string;
  title: string;
  status?: SelectMatter['status'];
  responsibleAttorneyId?: string | null;
  originatingAttorneyId?: string | null;
}

const insertMatter = async (params: InsertMatterParams): Promise<SelectMatter> => {
  const db = getTestDb();
  const [row] = await db
    .insert(matters)
    .values({
      organization_id: params.orgId,
      title: params.title,
      billing_type: 'hourly',
      attorney_hourly_rate: 10000,
      status: params.status ?? 'active',
      responsible_attorney_id: params.responsibleAttorneyId ?? null,
      originating_attorney_id: params.originatingAttorneyId ?? null,
    })
    .returning();
  return row;
};

interface InsertTimeEntryParams {
  matterId: string;
  userId: string;
  billable: boolean;
  invoiceId?: string | null;
  startTime?: Date;
  endTime?: Date;
}

const insertTimeEntry = async (params: InsertTimeEntryParams): Promise<SelectMatterTimeEntry> => {
  const db = getTestDb();
  const start = params.startTime ?? new Date('2026-04-01T09:00:00Z');
  const end = params.endTime ?? new Date('2026-04-01T10:00:00Z');
  const [row] = await db
    .insert(matterTimeEntries)
    .values({
      matter_id: params.matterId,
      user_id: params.userId,
      start_time: start,
      end_time: end,
      duration: Math.floor((end.getTime() - start.getTime()) / 1000),
      billable: params.billable,
      invoice_id: params.invoiceId ?? null,
      invoiced_at: params.invoiceId ? new Date() : null,
    })
    .returning();
  return row;
};

interface InsertTaskParams {
  matterId: string;
  name: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  status?: 'pending' | 'in_progress' | 'complete' | 'blocked';
}

const insertTask = async (params: InsertTaskParams): Promise<SelectMatterTask> => {
  const db = getTestDb();
  const [row] = await db
    .insert(matterTasks)
    .values({
      matter_id: params.matterId,
      name: params.name,
      stage: 'discovery',
      assignee_id: params.assigneeId ?? null,
      due_date: params.dueDate ?? null,
      status: params.status ?? 'pending',
    })
    .returning();
  return row;
};

interface MattersListResponseBody {
  matters: SelectMatter[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface SummaryRow {
  originating_attorney_id: string | null;
  total_matters: number;
  active_matters: number;
  closed_matters: number;
}

describe('Matters reports endpoints', () => {
  let sessionToken = '';
  let org: TestOrganization = { id: '', name: '', slug: '' };
  let ownerId = '';
  let attorneyAId = '';
  let attorneyBId = '';

  let matterAttorneyA: SelectMatter;
  let matterAttorneyB: SelectMatter;
  let matterOriginatingAClosed: SelectMatter;
  let matterOriginatingANoResponsible: SelectMatter;

  beforeAll(async () => {
    const ctx = await createTestContext('owner');
    org = ctx.org;
    sessionToken = ctx.sessionToken;
    const session = ctx.session as { user: { id: string } } | null;
    ownerId = session!.user.id;

    // Create two other users to use as attorneys and add them to the org as members
    const attorneyA = await createTestUser({ email: `attorney-a-${randomUUID().slice(0, 8)}@test.example`, name: 'Attorney A' });
    const attorneyB = await createTestUser({ email: `attorney-b-${randomUUID().slice(0, 8)}@test.example`, name: 'Attorney B' });
    await addUserToOrganization(attorneyA.id, org.id, 'admin');
    await addUserToOrganization(attorneyB.id, org.id, 'admin');
    attorneyAId = attorneyA.id;
    attorneyBId = attorneyB.id;

    // Matters
    matterAttorneyA = await insertMatter({
      orgId: org.id,
      title: 'Matter — Resp A / Orig A',
      status: 'active',
      responsibleAttorneyId: attorneyAId,
      originatingAttorneyId: attorneyAId,
    });
    matterAttorneyB = await insertMatter({
      orgId: org.id,
      title: 'Matter — Resp B / Orig B',
      status: 'active',
      responsibleAttorneyId: attorneyBId,
      originatingAttorneyId: attorneyBId,
    });
    matterOriginatingAClosed = await insertMatter({
      orgId: org.id,
      title: 'Matter — Orig A closed',
      status: 'closed',
      responsibleAttorneyId: null,
      originatingAttorneyId: attorneyAId,
    });
    matterOriginatingANoResponsible = await insertMatter({
      orgId: org.id,
      title: 'Matter — Orig A active no responsible',
      status: 'active',
      responsibleAttorneyId: null,
      originatingAttorneyId: attorneyAId,
    });

    // Time entries for matterAttorneyA
    await insertTimeEntry({ matterId: matterAttorneyA.id, userId: ownerId, billable: true, invoiceId: null });
    await insertTimeEntry({
      matterId: matterAttorneyA.id,
      userId: ownerId,
      billable: false,
      invoiceId: null,
      startTime: new Date('2026-04-02T09:00:00Z'),
      endTime: new Date('2026-04-02T10:00:00Z'),
    });
    // Tasks
    await insertTask({
      matterId: matterAttorneyA.id,
      name: 'Task — assignee A, due 2026-06-01, pending',
      assigneeId: attorneyAId,
      dueDate: '2026-06-01',
      status: 'pending',
    });
    await insertTask({
      matterId: matterAttorneyA.id,
      name: 'Task — assignee B, due 2026-12-01, in_progress',
      assigneeId: attorneyBId,
      dueDate: '2026-12-01',
      status: 'in_progress',
    });
    await insertTask({
      matterId: matterAttorneyB.id,
      name: 'Task — no due date, assignee A',
      assigneeId: attorneyAId,
      dueDate: null,
      status: 'pending',
    });
  });

  // ==================== Time entries — invoiced filter ====================

  it('GET time-entries with invoiced=false returns only entries where invoice_id IS NULL', async () => {
    const res = await toTypedResponse<SelectMatterTimeEntry[]>(
      authedRequest(sessionToken).get(`/api/matters/${org.id}/${matterAttorneyA.id}/time-entries?invoiced=false`)
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.every((e) => e.invoice_id === null)).toBe(true);
  });

  it('GET time-entries with invoiced=true returns 0 entries when none are invoiced', async () => {
    // Our test data has no invoiced entries (no invoice rows created), so this should be empty.
    const res = await toTypedResponse<SelectMatterTimeEntry[]>(
      authedRequest(sessionToken).get(`/api/matters/${org.id}/${matterAttorneyA.id}/time-entries?invoiced=true`)
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  it('GET time-entries with billable=true filters correctly (regression — already exists)', async () => {
    const res = await toTypedResponse<SelectMatterTimeEntry[]>(
      authedRequest(sessionToken).get(`/api/matters/${org.id}/${matterAttorneyA.id}/time-entries?billable=true`)
    );

    expect(res.status).toBe(200);
    expect(res.body.every((e) => e.billable === true)).toBe(true);
  });

  // ==================== Matters list — attorney filters ====================

  it('GET /{practice_id} with responsible_attorney_id=<uuid> filters correctly', async () => {
    const res = await toTypedResponse<MattersListResponseBody>(
      authedRequest(sessionToken).get(`/api/matters/${org.id}?responsible_attorney_id=${attorneyAId}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.matters.length).toBeGreaterThanOrEqual(1);
    expect(res.body.matters.every((m) => m.responsible_attorney_id === attorneyAId)).toBe(true);
    const titles = res.body.matters.map((m) => m.title);
    expect(titles).toContain(matterAttorneyA.title);
    expect(titles).not.toContain(matterAttorneyB.title);
  });

  it('GET /{practice_id} with originating_attorney_id=<uuid> filters correctly', async () => {
    const res = await toTypedResponse<MattersListResponseBody>(
      authedRequest(sessionToken).get(`/api/matters/${org.id}?originating_attorney_id=${attorneyAId}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.matters.every((m) => m.originating_attorney_id === attorneyAId)).toBe(true);
    const ids = new Set(res.body.matters.map((m) => m.id));
    expect(ids.has(matterAttorneyA.id)).toBe(true);
    expect(ids.has(matterOriginatingAClosed.id)).toBe(true);
    expect(ids.has(matterOriginatingANoResponsible.id)).toBe(true);
    expect(ids.has(matterAttorneyB.id)).toBe(false);
  });

  it('GET /{practice_id} with status filter (regression — already exists)', async () => {
    const res = await toTypedResponse<MattersListResponseBody>(
      authedRequest(sessionToken).get(`/api/matters/${org.id}?status=closed`)
    );

    expect(res.status).toBe(200);
    expect(res.body.matters.every((m) => m.status === 'closed')).toBe(true);
    expect(res.body.matters.some((m) => m.id === matterOriginatingAClosed.id)).toBe(true);
  });

  // ==================== Summary by originating attorney ====================

  it('GET /{practice_id}/summary/by-originating-attorney returns one group per attorney with correct counts', async () => {
    const res = await toTypedResponse<SummaryRow[]>(
      authedRequest(sessionToken).get(`/api/matters/${org.id}/summary/by-originating-attorney`)
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const byAttorney = new Map(res.body.map((r) => [r.originating_attorney_id, r]));

    // Attorney A: 3 total (1 active, 1 closed, 1 active no responsible)
    const a = byAttorney.get(attorneyAId);
    expect(a).toBeDefined();
    expect(a!.total_matters).toBe(3);
    expect(a!.closed_matters).toBe(1);
    expect(a!.active_matters).toBe(2);

    // Attorney B: 1 total, 1 active, 0 closed
    const b = byAttorney.get(attorneyBId);
    expect(b).toBeDefined();
    expect(b!.total_matters).toBe(1);
    expect(b!.closed_matters).toBe(0);
    expect(b!.active_matters).toBe(1);
  });

  // ==================== Org-wide tasks ====================

  it('GET /{practice_id}/tasks returns org-wide tasks (no filter)', async () => {
    const res = await toTypedResponse<SelectMatterTask[]>(
      authedRequest(sessionToken).get(`/api/matters/${org.id}/tasks`)
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    // All returned tasks are linked to matters within the org (we cannot assert org_id directly on task)
    // but we should see tasks from both matterAttorneyA and matterAttorneyB
    const matterIds = new Set(res.body.map((t) => t.matter_id));
    expect(matterIds.has(matterAttorneyA.id)).toBe(true);
    expect(matterIds.has(matterAttorneyB.id)).toBe(true);
  });

  it('GET /{practice_id}/tasks with assignee_id filters correctly', async () => {
    const res = await toTypedResponse<SelectMatterTask[]>(
      authedRequest(sessionToken).get(`/api/matters/${org.id}/tasks?assignee_id=${attorneyBId}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.every((t) => t.assignee_id === attorneyBId)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /{practice_id}/tasks with status filters correctly', async () => {
    const res = await toTypedResponse<SelectMatterTask[]>(
      authedRequest(sessionToken).get(`/api/matters/${org.id}/tasks?status=in_progress`)
    );

    expect(res.status).toBe(200);
    expect(res.body.every((t) => t.status === 'in_progress')).toBe(true);
  });

  it('GET /{practice_id}/tasks with due_before=<date> excludes tasks with NULL due_date', async () => {
    const res = await toTypedResponse<SelectMatterTask[]>(
      authedRequest(sessionToken).get(`/api/matters/${org.id}/tasks?due_before=2026-08-01`)
    );

    expect(res.status).toBe(200);
    // The task due 2026-06-01 should match; the task due 2026-12-01 should not; the null-due task should not.
    expect(res.body.every((t) => t.due_date !== null)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const names = res.body.map((t) => t.name);
    expect(names).toContain('Task — assignee A, due 2026-06-01, pending');
    expect(names).not.toContain('Task — assignee B, due 2026-12-01, in_progress');
    expect(names).not.toContain('Task — no due date, assignee A');
  });

  it('GET /{practice_id}/tasks is NOT caught by requireMatterAccess() (literal path wins)', async () => {
    // If this were caught by the matter sub-router, the middleware would attempt to verify
    // a matter with id "tasks" and respond with 404. We assert it returns 200 instead.
    const res = await authedRequest(sessionToken).get(`/api/matters/${org.id}/tasks`);
    expect([200]).toContain(res.status);
  });

  it('GET /{practice_id}/summary/by-originating-attorney is NOT caught by requireMatterAccess() (literal path wins)', async () => {
    const res = await authedRequest(sessionToken).get(`/api/matters/${org.id}/summary/by-originating-attorney`);
    expect([200]).toContain(res.status);
  });

  // ==================== Auth ====================

  it('GET /{practice_id}/tasks returns 401 for unauthenticated request', async () => {
    const res = await orgProtectedRequest.get(`/api/matters/${org.id}/tasks`);
    expect(res.status).toBe(401);
  });

  it('GET /{practice_id}/summary/by-originating-attorney returns 401 for unauthenticated request', async () => {
    const res = await orgProtectedRequest.get(`/api/matters/${org.id}/summary/by-originating-attorney`);
    expect(res.status).toBe(401);
  });
});
