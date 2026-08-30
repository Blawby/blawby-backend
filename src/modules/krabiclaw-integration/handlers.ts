import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

import {
  KrabiClawFacadeValidationError,
  KrabiClawUpstreamDependencyError,
} from '@/modules/krabiclaw-integration/errors/facade-errors';
import type {
  getConnectAccountRoute,
  getConnectStatusRoute,
  postAccountSessionRoute,
  postConnectedAccountsRoute,
} from '@/modules/krabiclaw-integration/routes/connect.routes';
import type {
  getPracticeDetailsRoute,
  patchPracticeDetailsRoute,
  postPracticeDetailsRoute,
} from '@/modules/krabiclaw-integration/routes/practice.routes';
import { createConnectedAccount } from '@/modules/onboarding/operations/create-connected-account.operation';
import { getConnectStatus } from '@/modules/onboarding/operations/get-connect-status.operation';
import { getConnectedAccount } from '@/modules/onboarding/operations/get-connected-account.operation';
import { getPracticeDetails } from '@/modules/practice/operations/get-practice-details.operation';
import { upsertPracticeDetails } from '@/modules/practice/operations/upsert-practice-details.operation';
import { createAccountSession } from '@/modules/stripe/operations/create-account-session.operation';
import { config } from '@/shared/config';
import type { AppContext, AppRouteHandler } from '@/shared/types/hono';

/**
 * Handlers are thin (KTD4): validate facade DTOs (already done by the
 * route's own schema before this runs), build operation inputs strictly
 * from `KrabiClawFacadeRequestContext` (never the request body, for
 * organization/user identity — R14), dispatch the one owning Legal
 * Operation, and reserialize its direct result or its reviewed error
 * (KTD8). No repository or Stripe SDK call happens here directly.
 */

interface ReviewedDomainErrorMapping {
  status: 400 | 404 | 409 | 422;
  code: string;
  message: string;
}

/**
 * `http.ts`'s `onError` only recognizes the five policy-layer error classes
 * from `errors/facade-errors.ts` — it has no branch for `resource_not_found`,
 * `state_conflict`, or `prerequisite_failed` (KTD8 explicitly leaves
 * per-route-family reserialization to this unit). So a reviewed domain 4xx
 * is built and returned directly here, never thrown, to avoid falling into
 * `onError`'s generic "unmapped HTTPException" sanitizer (which would turn
 * a real reviewed 404/409/422 into a misleading 502).
 */
const reviewedDomainErrorResponse = (c: Context<AppContext>, mapping: ReviewedDomainErrorMapping) =>
  c.json(
    { error: { code: mapping.code, message: mapping.message }, request_id: c.get('requestId') ?? null },
    mapping.status
  );

/**
 * Maps every `HTTPException` the practice Legal Operations can throw onto
 * one entry of the practice family's Reviewed Error Contract row
 * (`400 validation_failed`, `404 resource_not_found`, `409 state_conflict`).
 * Returns `null` for a non-`HTTPException` or a 5xx `HTTPException` — those
 * propagate unchanged so `http.ts`'s generic fallback sanitizes them as
 * `503 dependency_unavailable` (a genuine dependency failure, not a
 * reviewed domain outcome). Never reuses the operation's own message text.
 */
const mapPracticeOperationError = (error: unknown): ReviewedDomainErrorMapping | null => {
  if (!(error instanceof HTTPException)) {
    return null;
  }
  if (error.status === 404) {
    return { status: 404, code: 'resource_not_found', message: 'Practice details were not found' };
  }
  if (error.status === 409) {
    return {
      status: 409,
      code: 'state_conflict',
      message: 'Practice details could not be saved due to a conflicting update',
    };
  }
  if (error.status >= 400 && error.status < 500) {
    return { status: 400, code: 'validation_failed', message: 'Practice details request could not be validated' };
  }
  return null;
};

/** Same shape as `mapPracticeOperationError`, for the Connect family's four reviewed codes. */
const mapConnectOperationError = (error: unknown): ReviewedDomainErrorMapping | null => {
  if (!(error instanceof HTTPException)) {
    return null;
  }
  if (error.status === 404) {
    return {
      status: 404,
      code: 'resource_not_found',
      message: 'No connected Stripe account was found for this practice',
    };
  }
  if (error.status === 409) {
    return { status: 409, code: 'state_conflict', message: 'A conflicting Connect operation is already in progress' };
  }
  if (error.status === 422) {
    return { status: 422, code: 'prerequisite_failed', message: 'Connect account setup could not be completed' };
  }
  if (error.status >= 400 && error.status < 500) {
    return { status: 400, code: 'validation_failed', message: 'Connect request could not be validated' };
  }
  return null;
};

const getPracticeDetailsHandler: AppRouteHandler<typeof getPracticeDetailsRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  try {
    const result = await getPracticeDetails(
      { organizationId: ctx.legalOperationContext.organizationId },
      ctx.legalOperationContext
    );
    return c.json(result, 200);
  } catch (error) {
    const mapped = mapPracticeOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

const postPracticeDetailsHandler: AppRouteHandler<typeof postPracticeDetailsRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const data = c.req.valid('json');
  try {
    const result = await upsertPracticeDetails(
      { organizationId: ctx.legalOperationContext.organizationId, data },
      ctx.legalOperationContext
    );
    return c.json(result, 201);
  } catch (error) {
    const mapped = mapPracticeOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

const patchPracticeDetailsHandler: AppRouteHandler<typeof patchPracticeDetailsRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const data = c.req.valid('json');
  try {
    const result = await upsertPracticeDetails(
      { organizationId: ctx.legalOperationContext.organizationId, data },
      ctx.legalOperationContext
    );
    return c.json(result, 200);
  } catch (error) {
    const mapped = mapPracticeOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

/**
 * KTD7/R13: bilateral exact-equality check against this deployment's
 * configured HTTPS Connect callback values — never prefix or origin-only
 * matching — before any Stripe call or durable claim. Missing configuration
 * (unset in this environment) is a dependency-unavailable condition, not a
 * caller validation failure, and reuses the already-recognized
 * `KrabiClawUpstreamDependencyError` so `http.ts`'s `onError` sanitizes it
 * the same way as any other unavailable facade dependency.
 */
const assertConnectCallbackUrls = (returnUrl: string, refreshUrl: string): void => {
  const configuredReturnUrl = config.krabiclaw.connect.returnUrl;
  const configuredRefreshUrl = config.krabiclaw.connect.refreshUrl;
  if (!configuredReturnUrl || !configuredRefreshUrl) {
    throw new KrabiClawUpstreamDependencyError(503, 'Connect callback configuration is not available');
  }
  if (returnUrl !== configuredReturnUrl || refreshUrl !== configuredRefreshUrl) {
    throw new KrabiClawFacadeValidationError('Connect callback URL does not match the configured value');
  }
};

const postConnectedAccountsHandler: AppRouteHandler<typeof postConnectedAccountsRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const body = c.req.valid('json');

  assertConnectCallbackUrls(body.return_url, body.refresh_url);

  // R14/R20: the acting human's email is derived from the D1-verified user directory record, never from the request body — Connect is human-actor-only (actorPolicy: 'human'), so this is always present once the actor-kind gate has passed.
  const email = ctx.userDirectory?.email;
  if (!email) {
    throw new KrabiClawUpstreamDependencyError(503, 'Could not resolve the acting user for this Connect request');
  }

  try {
    const result = await createConnectedAccount(
      {
        organizationId: ctx.legalOperationContext.organizationId,
        email,
        refreshUrl: body.refresh_url,
        returnUrl: body.return_url,
        requestKey: body.request_key,
      },
      ctx.legalOperationContext
    );
    return c.json(result, 201);
  } catch (error) {
    const mapped = mapConnectOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

const getConnectStatusHandler: AppRouteHandler<typeof getConnectStatusRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  try {
    const result = await getConnectStatus(
      { organizationId: ctx.legalOperationContext.organizationId },
      ctx.legalOperationContext
    );
    return c.json(result, 200);
  } catch (error) {
    const mapped = mapConnectOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

const postAccountSessionHandler: AppRouteHandler<typeof postAccountSessionRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  const { components } = c.req.valid('json');
  try {
    const result = await createAccountSession(
      { organizationId: ctx.legalOperationContext.organizationId, components },
      ctx.legalOperationContext
    );
    return c.json(result, 201);
  } catch (error) {
    const mapped = mapConnectOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

const getConnectAccountHandler: AppRouteHandler<typeof getConnectAccountRoute> = async (c) => {
  const ctx = c.get('krabiclawFacadeRequestContext')!;
  try {
    const result = await getConnectedAccount(
      { organizationId: ctx.legalOperationContext.organizationId },
      ctx.legalOperationContext
    );
    return c.json(result, 200);
  } catch (error) {
    const mapped = mapConnectOperationError(error);
    if (mapped) {
      return reviewedDomainErrorResponse(c, mapped);
    }
    throw error;
  }
};

export {
  getPracticeDetailsHandler,
  postPracticeDetailsHandler,
  patchPracticeDetailsHandler,
  postConnectedAccountsHandler,
  getConnectStatusHandler,
  postAccountSessionHandler,
  getConnectAccountHandler,
};
