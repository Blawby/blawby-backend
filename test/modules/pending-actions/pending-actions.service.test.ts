import { describe, expect, it, beforeAll } from 'vitest';
import { authHelpers } from '@/test/helpers/auth';
import type { TestOrganization } from '@/test/types/shared';
import { pendingActionsService } from '@/modules/pending-actions/services/pending-actions.service';
import { pendingActionsQueries } from '@/modules/pending-actions/database/queries/pending-actions.queries';
import { createSystemContext } from '@/shared/types/service-context';

const { createTestContext } = authHelpers;

describe('pendingActionsService', () => {
  let org: TestOrganization;
  let userId: string;

  beforeAll(async () => {
    const ctx = await createTestContext('owner');
    org = ctx.org;
    userId = ctx.session?.user.id ?? '';
  });

  const ctxFor = (organizationId: string) => createSystemContext(organizationId, userId);

  const create = (overrides?: Partial<{ toolName: string; idempotencyKey: string }>) =>
    pendingActionsService.createPendingAction({
      organizationId: org.id,
      createdByUserId: userId,
      toolName: overrides?.toolName ?? 'send_invoice',
      toolParams: { invoice_id: 'inv_1' },
      idempotencyKey: overrides?.idempotencyKey ?? `key_${Math.random()}`,
    });

  it('creates a pending action in "pending" status', async () => {
    const row = await create();
    expect(row.status).toBe('pending');
    expect(row.organization_id).toBe(org.id);
  });

  it('dedupes a second create with the same idempotency key instead of creating a new row', async () => {
    const key = `dedupe_${Math.random()}`;
    const first = await create({ idempotencyKey: key });
    const second = await create({ idempotencyKey: key });
    expect(second.id).toBe(first.id);
  });

  it('does not dedupe across different tool names even with the same key', async () => {
    const key = `cross_tool_${Math.random()}`;
    const a = await create({ toolName: 'send_invoice', idempotencyKey: key });
    const b = await create({ toolName: 'void_invoice', idempotencyKey: key });
    expect(a.id).not.toBe(b.id);
  });

  it('approve executes exactly once and transitions pending -> executed', async () => {
    const row = await create();
    let callCount = 0;
    const execute = async (): Promise<unknown> => {
      callCount += 1;
      return { ok: true };
    };

    const approved = await pendingActionsService.approve(row.id, ctxFor(org.id), execute);

    expect(approved.status).toBe('executed');
    expect(approved.execution_result).toEqual({ ok: true });
    expect(callCount).toBe(1);
  });

  it('a second approve attempt on an already-executed row is rejected (CAS prevents double execution)', async () => {
    const row = await create();
    const execute = async (): Promise<unknown> => ({ ok: true });

    await pendingActionsService.approve(row.id, ctxFor(org.id), execute);

    await expect(pendingActionsService.approve(row.id, ctxFor(org.id), execute)).rejects.toThrow();
  });

  it('marks the row "failed" and surfaces the error when execution throws', async () => {
    const row = await create();
    const execute = async (): Promise<unknown> => {
      throw new Error('downstream failure');
    };

    await expect(pendingActionsService.approve(row.id, ctxFor(org.id), execute)).rejects.toThrow(
      /downstream failure/
    );

    const persisted = await pendingActionsService.getById(row.id, ctxFor(org.id));
    expect(persisted.status).toBe('failed');
    expect(persisted.execution_error).toContain('downstream failure');
  });

  it('reject transitions pending -> rejected without executing', async () => {
    const row = await create();
    const rejected = await pendingActionsService.reject(row.id, ctxFor(org.id), 'not needed');

    expect(rejected.status).toBe('rejected');
    expect(rejected.review_notes).toBe('not needed');
  });

  it('rejecting an already-rejected row throws', async () => {
    const row = await create();
    await pendingActionsService.reject(row.id, ctxFor(org.id));

    await expect(pendingActionsService.reject(row.id, ctxFor(org.id))).rejects.toThrow();
  });

  it('getById lazily transitions an overdue pending row to "expired"', async () => {
    const row = await pendingActionsQueries.create({
      organization_id: org.id,
      created_by_user_id: userId,
      tool_name: 'send_invoice',
      tool_params: { invoice_id: 'inv_1' },
      idempotency_key: `expired_${Math.random()}`,
      status: 'pending',
      expires_at: new Date(Date.now() - 1000),
    });

    const fetched = await pendingActionsService.getById(row.id, ctxFor(org.id));
    expect(fetched.status).toBe('expired');
  });

  it('does not dedupe against an already-expired row — a fresh call gets a new pending action', async () => {
    const key = `expired_dedupe_${Math.random()}`;
    await pendingActionsQueries.create({
      organization_id: org.id,
      created_by_user_id: userId,
      tool_name: 'send_invoice',
      tool_params: { invoice_id: 'inv_1' },
      idempotency_key: key,
      status: 'pending',
      expires_at: new Date(Date.now() - 1000),
    });

    const fresh = await create({ idempotencyKey: key });
    expect(fresh.status).toBe('pending');
    expect(fresh.expires_at.getTime()).toBeGreaterThan(Date.now());
  });
});
