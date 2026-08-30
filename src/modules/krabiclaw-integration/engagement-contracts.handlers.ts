import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { acceptEngagementContract } from '@/modules/engagement-contracts/operations/accept-engagement-contract.operation';
import { createEngagementContract } from '@/modules/engagement-contracts/operations/create-engagement-contract.operation';
import { declineEngagementContract } from '@/modules/engagement-contracts/operations/decline-engagement-contract.operation';
import { getEngagementContract } from '@/modules/engagement-contracts/operations/get-engagement-contract.operation';
import { listEngagementContracts } from '@/modules/engagement-contracts/operations/list-engagement-contracts.operation';
import { sendEngagementContract } from '@/modules/engagement-contracts/operations/send-engagement-contract.operation';
import { updateEngagementContract } from '@/modules/engagement-contracts/operations/update-engagement-contract.operation';
import type {
  createEngagementContractRoute,
  getEngagementContractRoute,
  listEngagementContractsRoute,
  updateEngagementContractRoute,
  updateEngagementContractStatusRoute,
} from '@/modules/krabiclaw-integration/routes/engagement-contracts.routes';
import type { AppContext, AppRouteHandler } from '@/shared/types/hono';

/**
 * Handlers are thin (KTD4): validate facade DTOs (already done by the
 * route's own schema before this runs), build operation inputs strictly
 * from `KrabiClawFacadeRequestContext` (never the request body, for
 * organization/user identity — R14), dispatch the one owning Legal
 * Operation, and reserialize its direct result or its reviewed error
 * (KTD8). No repository call happens here directly.
 *
 * Actor-flag/response-projection audit (U4's Critical finding class): none
 * of the engagement-contract operations (`create-engagement-contract`,
 * `list-engagement-contracts`, `get-engagement-contract`,
 * `update-engagement-contract`, `send-engagement-contract`,
 * `accept-engagement-contract`, `decline-engagement-contract`) accept or
 * consume any actor-context flag comparable to `IntakeActorContext.isStaff`
 * — they all take a plain `LegalOperationContext` and derive their own
 * authorization entirely from `ctx.userId`/`ctx.organizationId` via
 * `assertHumanActor`/`assertLegalOperationTenant`. There is no response
 * formatter here with an `isAdmin`/`isStaff`-gated field set to leak — every
 * route in this file returns the same `EngagementContractRecord` shape to
 * every caller who passes the tenant/actor checks. Confirmed by reading
 * every operation file directly, not inferred.
 */

interface ReviewedDomainErrorMapping {
  status: 400 | 404 | 409;
  code: string;
  message: string;
}

/**
 * `http.ts`'s `onError` only recognizes the five policy-layer error classes
 * from `errors/facade-errors.ts` — it has no branch for `resource_not_found`
 * or `state_conflict` (KTD8 explicitly leaves per-route-family
 * reserialization to this unit). So a reviewed domain 4xx is built and
 * returned directly here, never thrown, to avoid falling into `onError`'s
 * generic "unmapped HTTPException" sanitizer (which would turn a real
 * reviewed 404/409 into a misleading 502).
 */
const reviewedDomainErrorResponse = (c: Context<AppContext>, mapping: ReviewedDomainErrorMapping) =>
  c.json(
    { error: { code: mapping.code, message: mapping.message }, request_id: c.get('requestId') ?? null },
    mapping.status
  );

/**
 * Maps every `HTTPException` the engagement-contract Legal Operations can
 * throw onto one entry of the engagement family's Reviewed Error Contract
 * row (`400 validation_failed`, `404 resource_not_found`,
 * `409 state_conflict`). A tenant mismatch
 * (`assertLegalOperationTenant`, thrown as 403) and the `assertHumanActor`
 * guard's own 403 both fold into `404 resource_not_found` — unlike the U4
 * staff-intake family, the engagement family's Reviewed Error Contract row
 * has no `403` entry, so disclosing "this contract exists but belongs to
 * another organization" would be a cross-tenant existence oracle the
 * approved contract table does not authorize. Returns `null` for a
 * non-`HTTPException` or a 5xx `HTTPException` — those propagate unchanged
 * so `http.ts`'s generic fallback sanitizes them as `503
 * dependency_unavailable`. Never reuses the operation's own message text
 * (which can include rendered contract content — "never expose rendered
 * contract content in an error").
 */
const mapEngagementOperationError = (error: unknown): ReviewedDomainErrorMapping | null => {
  if (!(error instanceof HTTPException)) {
    return null;
  }
  if (error.status === 404 || error.status === 403) {
    return { status: 404, code: 'resource_not_found', message: 'Engagement contract was not found' };
  }
  if (error.status === 409) {
    return {
      status: 409,
      code: 'state_conflict',
      message: 'Engagement contract could not be updated due to a conflicting state',
    };
  }
  if (error.status >= 400 && error.status < 500) {
    return { status: 400, code: 'validation_failed', message: 'Engagement contract request could not be validated' };
  }
  return null;
};

const createEngagementContractHandler: AppRouteHandler<typeof createEngagementContractRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const data = c.req.valid('json');
  try {
    const result = await createEngagementContract(
      { organizationId: ctx.legalOperationContext.organizationId, data },
      ctx.legalOperationContext
    );
    return c.json(result, 201);
  } catch (error) {
    const mapped = mapEngagementOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

const listEngagementContractsHandler: AppRouteHandler<typeof listEngagementContractsRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const query = c.req.valid('query');
  try {
    const result = await listEngagementContracts(
      { organizationId: ctx.legalOperationContext.organizationId, query },
      ctx.legalOperationContext
    );
    return c.json(result, 200);
  } catch (error) {
    const mapped = mapEngagementOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

const getEngagementContractHandler: AppRouteHandler<typeof getEngagementContractRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const { contract_id: id } = c.req.valid('param');
  try {
    const result = await getEngagementContract(id, ctx.legalOperationContext);
    return c.json(result, 200);
  } catch (error) {
    const mapped = mapEngagementOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

const updateEngagementContractHandler: AppRouteHandler<typeof updateEngagementContractRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const { contract_id: id } = c.req.valid('param');
  const data = c.req.valid('json');
  try {
    const result = await updateEngagementContract({ id, data }, ctx.legalOperationContext);
    return c.json(result, 200);
  } catch (error) {
    const mapped = mapEngagementOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

/**
 * Status-action dispatch (send/decline/accept), mirroring the existing
 * authenticated Blawby route's own dispatch shape
 * (`engagement-contracts/handlers.ts`'s `updateEngagementContractStatusHandler`).
 * The facade handler dispatches exactly one operation call and reserializes
 * whatever result or conflict that operation returns — it adds no locking
 * or retry of its own (KTD4); the owning `acceptEngagementContract`
 * operation already implements the single-winner concurrent-acceptance
 * semantics (row lock + re-check inside its transaction) this unit relies
 * on unchanged.
 *
 * R27: only the `accepted` branch reads `ctx.trustedOriginatingClientIp` and
 * forwards it as `clientIp` — `sent` and `declined` never read it, even
 * though the route's `acceptsOriginatingClientIp: true` policy permits the
 * header's presence for every action on this route (see
 * `engagement-contracts.routes.ts`'s doc comment on
 * `updateEngagementContractStatusDefinition` for why that policy check is
 * necessarily per-route, not per-action).
 */
const updateEngagementContractStatusHandler: AppRouteHandler<typeof updateEngagementContractStatusRoute> = async (
  c
) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const { contract_id: id } = c.req.valid('param');
  const { status } = c.req.valid('json');

  try {
    if (status === 'sent') {
      const result = await sendEngagementContract({ id }, ctx.legalOperationContext);
      return c.json(result, 200);
    }

    if (status === 'accepted') {
      const clientIp = ctx.trustedOriginatingClientIp ?? undefined;
      const result = await acceptEngagementContract({ id, clientIp }, ctx.legalOperationContext);
      return c.json(result, 200);
    }

    const result = await declineEngagementContract({ id }, ctx.legalOperationContext);
    return c.json(result, 200);
  } catch (error) {
    const mapped = mapEngagementOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

export {
  createEngagementContractHandler,
  listEngagementContractsHandler,
  getEngagementContractHandler,
  updateEngagementContractHandler,
  updateEngagementContractStatusHandler,
};
