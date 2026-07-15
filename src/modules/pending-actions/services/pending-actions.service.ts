import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
import { pendingActionsQueries } from '@/modules/pending-actions/database/queries/pending-actions.queries';
import type { SelectPendingAction } from '@/modules/pending-actions/database/schema/pending-actions.schema';
import type { Action, Subject } from '@/shared/auth/abilities.types';
import type { ServiceContext } from '@/shared/types/service-context';
import { z } from 'zod';

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes, matching the approval-link copy shown to the caller.

const checkAuthorization = (ctx: ServiceContext, action: Action, subject: Subject): void => {
  if (!ctx.ability.can(action, subject)) {
    throw new ForbiddenError(ctx.ability).setMessage(`Cannot ${action} ${String(subject)}`);
  }
};

const isExpired = (row: SelectPendingAction): boolean => row.expires_at.getTime() < Date.now();

/**
 * Creates a pending action, or returns an existing non-terminal one with the
 * same idempotency key instead of creating a duplicate (an MCP tool call
 * retried within the same idempotency bucket should not spawn two approval
 * requests for the same underlying write).
 */
const createPendingAction = async (opts: {
  organizationId: string;
  createdByUserId: string;
  toolName: string;
  toolParams: Record<string, unknown>;
  idempotencyKey: string;
  ttlMs?: number;
}): Promise<SelectPendingAction> =>
  pendingActionsQueries.create({
    organization_id: opts.organizationId,
    created_by_user_id: opts.createdByUserId,
    tool_name: opts.toolName,
    tool_params: opts.toolParams,
    idempotency_key: opts.idempotencyKey,
    status: 'pending',
    expires_at: new Date(Date.now() + (opts.ttlMs ?? DEFAULT_TTL_MS)),
  });

/** Fetches a pending action, transitioning it to `expired` first if its TTL has lapsed. */
const getById = async (id: string, ctx: ServiceContext): Promise<SelectPendingAction> => {
  checkAuthorization(ctx, 'read', 'PendingAction');

  const row = await pendingActionsQueries.findById(id, ctx.organizationId);
  if (!row) {
    throw new HTTPException(404, { message: 'Pending action not found' });
  }

  if (row.status === 'pending' && isExpired(row)) {
    const expired = await pendingActionsQueries.transitionStatus(id, ctx.organizationId, 'pending', {
      status: 'expired',
    });
    if (expired) {
      return expired;
    }

    const fresh = await pendingActionsQueries.findById(id, ctx.organizationId);
    if (!fresh) {
      throw new HTTPException(404, { message: 'Pending action not found' });
    }
    return fresh;
  }

  return row;
};

const listByOrganization = async (
  ctx: ServiceContext,
  filters: { status?: string; limit: number; offset: number }
): Promise<SelectPendingAction[]> => {
  checkAuthorization(ctx, 'read', 'PendingAction');
  return pendingActionsQueries.listByOrganization(ctx.organizationId, filters);
};

/**
 * Approves and immediately executes a pending action. `execute` is injected
 * by the caller (mcp module owns the tool registry / dispatch logic — this
 * module only owns storage and the CAS state machine, to avoid a circular
 * dependency between the mcp and pending-actions modules).
 */
const approve = async (
  id: string,
  ctx: ServiceContext,
  execute: (row: SelectPendingAction, ctx: ServiceContext) => Promise<unknown>
): Promise<SelectPendingAction> => {
  checkAuthorization(ctx, 'update', 'PendingAction');

  const claimed = await pendingActionsQueries.transitionStatus(id, ctx.organizationId, 'pending', {
    status: 'executing',
    reviewed_by_user_id: ctx.userId,
    reviewed_at: new Date(),
  });

  if (!claimed) {
    const existing = await pendingActionsQueries.findById(id, ctx.organizationId);
    if (!existing) {
      throw new HTTPException(404, { message: 'Pending action not found' });
    }
    throw new HTTPException(409, {
      message: 'Only pending actions can be approved, or this one is already being processed',
    });
  }

  if (isExpired(claimed)) {
    const expired = await pendingActionsQueries.transitionStatus(id, ctx.organizationId, 'executing', {
      status: 'expired',
    });
    return expired ?? claimed;
  }

  try {
    const result = await execute(claimed, ctx);
    const executionResult = z.json().parse(result);
    const executed = await pendingActionsQueries.transitionStatus(id, ctx.organizationId, 'executing', {
      status: 'executed',
      executed_at: new Date(),
      execution_result: executionResult,
    });
    return executed ?? claimed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pendingActionsQueries.transitionStatus(id, ctx.organizationId, 'executing', {
      status: 'failed',
      executed_at: new Date(),
      execution_error: message,
    });
    throw new HTTPException(502, {
      message: `Pending action execution failed: ${message}`,
      cause: error,
    });
  }
};

const reject = async (id: string, ctx: ServiceContext, reviewNotes?: string): Promise<SelectPendingAction> => {
  checkAuthorization(ctx, 'update', 'PendingAction');

  const updated = await pendingActionsQueries.transitionStatus(id, ctx.organizationId, 'pending', {
    status: 'rejected',
    reviewed_by_user_id: ctx.userId,
    reviewed_at: new Date(),
    review_notes: reviewNotes,
  });

  if (!updated) {
    const existing = await pendingActionsQueries.findById(id, ctx.organizationId);
    if (!existing) {
      throw new HTTPException(404, { message: 'Pending action not found' });
    }
    throw new HTTPException(409, { message: 'Only pending actions can be rejected' });
  }

  return updated;
};

export const pendingActionsService = {
  createPendingAction,
  getById,
  listByOrganization,
  approve,
  reject,
};
