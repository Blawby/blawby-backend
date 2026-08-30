import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { KrabiClawUpstreamDependencyError } from '@/modules/krabiclaw-integration/errors/facade-errors';
import type {
  getIntakeByRequestReferenceRoute,
  getIntakeRoute,
  getIntakeSettingsRoute,
  getIntakeStatusRoute,
  getPostPayStatusRoute,
  listIntakesRoute,
  patchIntakeTriageRoute,
  postCheckoutSessionRoute,
  postIntakesRoute,
} from '@/modules/krabiclaw-integration/routes/intakes.routes';
import { createCheckoutSession } from '@/modules/practice-client-intakes/operations/create-checkout-session.operation';
import { createIntake } from '@/modules/practice-client-intakes/operations/create-intake.operation';
import { getIntakeByRequestReference } from '@/modules/practice-client-intakes/operations/get-intake-by-request-reference.operation';
import { getIntakeById } from '@/modules/practice-client-intakes/operations/get-intake-by-id.operation';
import { getIntakeSettings } from '@/modules/practice-client-intakes/operations/get-intake-settings.operation';
import { getIntakeStatus } from '@/modules/practice-client-intakes/operations/get-intake-status.operation';
import {
  getActorAccessibleIntake,
  type IntakeActorContext,
} from '@/modules/practice-client-intakes/operations/intake-actor-context';
import { listIntakes } from '@/modules/practice-client-intakes/operations/list-intakes.operation';
import { updateIntakeTriageStatus } from '@/modules/practice-client-intakes/operations/update-intake-triage-status.operation';
import { verifyPostPayConsistency } from '@/modules/practice-client-intakes/operations/verify-post-pay-consistency.operation';
import { extractOriginFromReferer } from '@/shared/utils/env';
import type { AppContext, AppRouteHandler } from '@/shared/types/hono';

/**
 * Handlers are thin (KTD4): validate facade DTOs (already done by the
 * route's own schema before this runs), build operation inputs strictly
 * from `KrabiClawFacadeRequestContext` (never the request body, for
 * organization/user identity — R14), dispatch the one owning Legal
 * Operation, and reserialize its direct result or its reviewed error
 * (KTD8). No repository or Stripe SDK call happens here directly.
 *
 * Anonymous follow-up authorization (KTD6, R5): every route that follows up
 * on an existing intake by UUID (status, checkout-session, post-pay/status)
 * has `requestReferencePolicy: 'required'`, so
 * `KrabiClawFacadeRequestContext.requestReference` is guaranteed non-null by
 * the route-scoped middleware before this handler ever runs. Status and
 * checkout-session compare it against the intake's stored
 * `krabiclaw_request_key` explicitly, below, before dispatching the owning
 * operation — the equivalent check for post-pay/status is already built into
 * `verifyPostPayConsistency` (U1), so no separate comparison is needed there.
 */

interface ReviewedDomainErrorMapping {
  status: 400 | 403 | 404 | 409 | 422;
  code: string;
  message: string;
}

/**
 * `http.ts`'s `onError` only recognizes the five policy-layer error classes
 * from `errors/facade-errors.ts` — a reviewed domain 4xx is built and
 * returned directly here, never thrown, to avoid falling into `onError`'s
 * generic "unmapped HTTPException" sanitizer (which would turn a real
 * reviewed 404/409/422 into a misleading 502).
 */
const reviewedDomainErrorResponse = (c: Context<AppContext>, mapping: ReviewedDomainErrorMapping) =>
  c.json(
    { error: { code: mapping.code, message: mapping.message }, request_id: c.get('requestId') ?? null },
    mapping.status
  );

/**
 * R14: ownership, request-reference, intake, and session mismatches all use
 * this exact same reviewed 404 — a single stable mapping object so no code
 * path can accidentally leak a distinguishing message across those
 * boundaries.
 */
const PUBLIC_INTAKE_NOT_FOUND: ReviewedDomainErrorMapping = {
  status: 404,
  code: 'resource_not_found',
  message: 'No matching intake was found',
};

/** `getActorAccessibleIntake`/`assertLegalOperationTenant`'s only 4xx codes are 403 (tenant/ownership mismatch) and 404 (not found) — both fold to the same reviewed 404 for the public intake family (R14). */
const mapPublicIntakeAccessError = (error: unknown): ReviewedDomainErrorMapping | null => {
  if (!(error instanceof HTTPException)) {
    return null;
  }
  if (error.status === 403 || error.status === 404) {
    return PUBLIC_INTAKE_NOT_FOUND;
  }
  return null;
};

const mapIntakeSettingsOperationError = (error: unknown): ReviewedDomainErrorMapping | null => {
  if (!(error instanceof HTTPException)) {
    return null;
  }
  if (error.status === 404) {
    return PUBLIC_INTAKE_NOT_FOUND;
  }
  if (error.status === 403) {
    return { status: 422, code: 'prerequisite_failed', message: 'Practice intake is not ready to accept submissions' };
  }
  return null;
};

const mapCreateIntakeOperationError = (error: unknown): ReviewedDomainErrorMapping | null => {
  if (!(error instanceof HTTPException)) {
    return null;
  }
  if (error.status === 404) {
    return PUBLIC_INTAKE_NOT_FOUND;
  }
  if (error.status >= 400 && error.status < 500) {
    return { status: 400, code: 'validation_failed', message: 'Intake request could not be validated' };
  }
  return null;
};

const mapCheckoutSessionOperationError = (error: unknown): ReviewedDomainErrorMapping | null => {
  if (!(error instanceof HTTPException)) {
    return null;
  }
  if (error.status === 404) {
    return PUBLIC_INTAKE_NOT_FOUND;
  }
  if (error.status === 403) {
    return { status: 422, code: 'prerequisite_failed', message: 'Connected account is not ready to accept payments' };
  }
  if (error.status === 400) {
    return { status: 409, code: 'request_conflict', message: 'Intake is not eligible for a checkout session' };
  }
  return null;
};

const mapPostPayOperationError = (error: unknown): ReviewedDomainErrorMapping | null => {
  if (!(error instanceof HTTPException)) {
    return null;
  }
  if (error.status === 404) {
    return PUBLIC_INTAKE_NOT_FOUND;
  }
  if (error.status === 409) {
    return {
      status: 409,
      code: 'request_conflict',
      message: 'Checkout session conflicts with a prior recorded session',
    };
  }
  return null;
};

/** Staff intake family: a tenant mismatch is disclosed as `403 forbidden` (distinct from the public family's 404-only contract — see `intakes.routes.ts`'s file-level comment). */
const mapStaffIntakeOperationError = (error: unknown): ReviewedDomainErrorMapping | null => {
  if (!(error instanceof HTTPException)) {
    return null;
  }
  if (error.status === 403) {
    return { status: 403, code: 'forbidden', message: 'Access to this resource is not permitted' };
  }
  if (error.status === 404) {
    return { status: 404, code: 'resource_not_found', message: 'Practice client intake not found' };
  }
  if (error.status >= 400 && error.status < 500) {
    return { status: 400, code: 'validation_failed', message: 'Staff intake request could not be validated' };
  }
  return null;
};

const getCreateIntakeRequestMetadata = (c: Context) => ({
  clientIp: c.req.header('x-forwarded-for') ?? c.req.header('remote-addr'),
  userAgent: c.req.header('user-agent'),
  origin: c.req.header('origin') ?? extractOriginFromReferer(c.req.header('referer')),
});

/**
 * Every route that reaches this guard has `requestReferencePolicy: 'required'`
 * (enforced by `createKrabiClawFacadeRouteMiddleware` before this handler ever
 * runs), so `ctx.requestReference` is always non-null in practice — this only
 * guards against a future route wiring mistake (a required-policy route whose
 * handler forgets the check), turning it into a sanitized 503 rather than a
 * runtime type error.
 */
const requireRequestReference = (requestReference: string | null): string => {
  if (!requestReference) {
    throw new KrabiClawUpstreamDependencyError(503, 'Missing verified request reference');
  }
  return requestReference;
};

const getIntakeSettingsHandler: AppRouteHandler<typeof getIntakeSettingsRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const { template_slug } = c.req.valid('query');
  try {
    const result = await getIntakeSettings(
      {
        organizationId: ctx.legalOperationContext.organizationId,
        templateSlug: template_slug,
        subscriptionPolicy: 'bypass',
      },
      ctx.legalOperationContext
    );
    return c.json(result, 200);
  } catch (error) {
    const mapped = mapIntakeSettingsOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

const postIntakesHandler: AppRouteHandler<typeof postIntakesRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const requestKey = requireRequestReference(ctx.requestReference);
  const body = c.req.valid('json');
  try {
    const result = await createIntake(
      {
        organizationId: ctx.legalOperationContext.organizationId,
        data: { ...body, ...getCreateIntakeRequestMetadata(c) },
        requestKey,
        subscriptionPolicy: 'bypass',
      },
      ctx.legalOperationContext
    );
    return c.json(result, 201);
  } catch (error) {
    const mapped = mapCreateIntakeOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

const getIntakeByRequestReferenceHandler: AppRouteHandler<typeof getIntakeByRequestReferenceRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const { request_id: requestId } = c.req.valid('param');
  try {
    const result = await getIntakeByRequestReference(
      { organizationId: ctx.legalOperationContext.organizationId, requestKey: requestId },
      ctx.legalOperationContext
    );
    return c.json(result, 200);
  } catch (error) {
    const mapped = mapPublicIntakeAccessError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

const getIntakeStatusHandler: AppRouteHandler<typeof getIntakeStatusRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const requestReference = requireRequestReference(ctx.requestReference);
  const { uuid } = c.req.valid('param');
  /**
   * `isStaff: true` here does not mean "this actor is Blawby staff" — it
   * means "this request has already been authorized by a mechanism other
   * than intake-row `metadata.user_id` ownership" (KTD6): the trusted
   * request-reference comparison immediately below IS that mechanism for
   * facade public-intake callers, replacing the CASL-derived `isStaff` flag
   * that authorized non-facade staff callers already assign it.
   */
  const actorCtx: IntakeActorContext = { ...ctx.legalOperationContext, isStaff: true };
  try {
    const intake = await getActorAccessibleIntake(uuid, actorCtx);
    if (intake.krabiclaw_request_key !== requestReference) {
      return reviewedDomainErrorResponse(c, PUBLIC_INTAKE_NOT_FOUND);
    }
    const result = await getIntakeStatus({ uuid }, actorCtx);
    return c.json(result, 200);
  } catch (error) {
    const mapped = mapPublicIntakeAccessError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

const listIntakesHandler: AppRouteHandler<typeof listIntakesRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const query = c.req.valid('query');
  try {
    const result = await listIntakes(
      { organizationId: ctx.legalOperationContext.organizationId, query },
      ctx.legalOperationContext
    );
    return c.json(result, 200);
  } catch (error) {
    const mapped = mapStaffIntakeOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

const getIntakeHandler: AppRouteHandler<typeof getIntakeRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const { uuid } = c.req.valid('param');
  try {
    const result = await getIntakeById(uuid, ctx.legalOperationContext);
    return c.json(result, 200);
  } catch (error) {
    const mapped = mapStaffIntakeOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

const patchIntakeTriageHandler: AppRouteHandler<typeof patchIntakeTriageRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const { uuid } = c.req.valid('param');
  const body = c.req.valid('json');
  try {
    const result = await updateIntakeTriageStatus({ uuid, data: body }, ctx.legalOperationContext);
    return c.json(result, 200);
  } catch (error) {
    const mapped = mapStaffIntakeOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

const postCheckoutSessionHandler: AppRouteHandler<typeof postCheckoutSessionRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const requestReference = requireRequestReference(ctx.requestReference);
  const { uuid } = c.req.valid('param');
  const origin = c.req.header('origin') ?? extractOriginFromReferer(c.req.header('referer'));
  // See `getIntakeStatusHandler`'s comment on `isStaff: true` — same meaning here.
  const actorCtx: IntakeActorContext = { ...ctx.legalOperationContext, isStaff: true };
  try {
    const intake = await getActorAccessibleIntake(uuid, actorCtx);
    if (intake.krabiclaw_request_key !== requestReference) {
      return reviewedDomainErrorResponse(c, PUBLIC_INTAKE_NOT_FOUND);
    }
    const result = await createCheckoutSession({ uuid, origin }, actorCtx);
    return c.json(result, 201);
  } catch (error) {
    const mapped = mapCheckoutSessionOperationError(error) ?? mapPublicIntakeAccessError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

const getPostPayStatusHandler: AppRouteHandler<typeof getPostPayStatusRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const requestKey = requireRequestReference(ctx.requestReference);
  const { uuid } = c.req.valid('param');
  const { session_id: sessionId } = c.req.valid('query');
  try {
    const result = await verifyPostPayConsistency(
      { organizationId: ctx.legalOperationContext.organizationId, intakeUuid: uuid, sessionId, requestKey },
      ctx.legalOperationContext
    );
    return c.json(result, 200);
  } catch (error) {
    const mapped = mapPostPayOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

export {
  getIntakeSettingsHandler,
  postIntakesHandler,
  getIntakeByRequestReferenceHandler,
  getIntakeStatusHandler,
  listIntakesHandler,
  getIntakeHandler,
  patchIntakeTriageHandler,
  postCheckoutSessionHandler,
  getPostPayStatusHandler,
};
