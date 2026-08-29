import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

import {
  KRABICLAW_MACHINE_AUTH_WWW_AUTHENTICATE,
  KrabiClawFacadeDisabledError,
  KrabiClawFacadeValidationError,
  KrabiClawMachineAuthError,
  KrabiClawPolicyForbiddenError,
  KrabiClawRateLimitedError,
  KrabiClawUpstreamDependencyError,
} from '@/modules/krabiclaw-integration/errors/facade-errors';
import { config } from '@/shared/config';
import { createHonoApp } from '@/shared/router/factory';

const logger = getLogger(['modules', 'krabiclaw-integration', 'http']);

const app = createHonoApp();

/**
 * Every facade response — success or failure — is marked `Cache-Control:
 * no-store` (R22). This covers the success path; `onError`/`notFound` below
 * set the same header on every error/404 path, since a thrown exception
 * skips the code after `await next()` here.
 */
app.use('*', async (c, next) => {
  await next();
  c.res.headers.set('Cache-Control', 'no-store');
});

/**
 * The ONLY thing the catch-all guard does (KTD2): the global kill switch.
 * `KRABICLAW_FACADE_ENABLED` defaults off (R17), so with no enablement
 * variable every allowlisted route fails closed here, before Hono even
 * attempts to match a route (AE5) — no D1/PostgreSQL/Stripe call, no token
 * verification, no header parsing.
 *
 * Everything else — fixed-client/exact-scope/rollout-group, actor kind,
 * trusted-header bounds, both rate-limit dimensions, and D1 identity
 * resolution — lives in route-scoped middleware
 * (`createKrabiClawFacadeRouteMiddleware`) attached directly to each
 * registered route by U3/U4/U5. Unknown methods and paths are rejected by
 * Hono's own router before any route-scoped middleware runs — no second
 * path matcher in this module ever recomputes policy for a request.
 */
app.use('*', (_c, next) => {
  if (!config.krabiclaw.facadeEnabled) {
    throw new KrabiClawFacadeDisabledError();
  }
  return next();
});

/**
 * No routes yet — U3/U4/U5 mount the Route Contract table's handlers here,
 * each registered via `defineFacadeRoute` (route-registry.ts) and guarded
 * by `createKrabiClawFacadeRouteMiddleware` (krabiclaw-facade.middleware.ts).
 */

const errorEnvelope = (code: string, message: string, requestId: string | null) => ({
  error: { code, message },
  request_id: requestId,
});

app.notFound((c) => {
  const response = c.json(errorEnvelope('facade_forbidden', 'Not found', c.get('requestId') ?? null), 404);
  response.headers.set('Cache-Control', 'no-store');
  return response;
});

/**
 * Maps every thrown error to the Reviewed Error Contract's bounded
 * `{ error: { code, message }, request_id }` envelope. Only the policy
 * layer's own codes (`invalid_token`, `facade_forbidden`, `rate_limited`,
 * `validation_failed`, `invalid_upstream_response`, `dependency_unavailable`)
 * are handled here — the per-route-family reserialization tables (KTD8) are
 * owned by U3/U4/U5's route handlers, which throw their own domain errors
 * before this catches anything unmapped.
 */
app.onError((error, c) => {
  const requestId = c.get('requestId') ?? null;

  if (error instanceof KrabiClawFacadeDisabledError) {
    const response = c.json(errorEnvelope('facade_forbidden', 'Not found', requestId), 404);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  if (error instanceof KrabiClawMachineAuthError) {
    const response = c.json(errorEnvelope('invalid_token', error.message, requestId), 401);
    response.headers.set('WWW-Authenticate', KRABICLAW_MACHINE_AUTH_WWW_AUTHENTICATE);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  if (error instanceof KrabiClawPolicyForbiddenError) {
    const response = c.json(errorEnvelope('facade_forbidden', 'Request is not permitted', requestId), 403);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  if (error instanceof KrabiClawRateLimitedError) {
    const response = c.json(errorEnvelope('rate_limited', 'Too many requests', requestId), 429);
    response.headers.set('Retry-After', String(error.retryAfterSeconds));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  if (error instanceof KrabiClawFacadeValidationError) {
    const response = c.json(errorEnvelope('validation_failed', 'Request failed facade validation', requestId), 400);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  if (error instanceof KrabiClawUpstreamDependencyError) {
    const code = error.status === 502 ? 'invalid_upstream_response' : 'dependency_unavailable';
    const response = c.json(
      errorEnvelope(code, 'A KrabiClaw facade dependency is unavailable', requestId),
      error.status
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  // Unknown/unmapped error: never pass through a raw exception or dependency body (R15, R25).
  logger.error('krabiclaw facade unmapped error: {error}', {
    error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError' },
  });
  const status = error instanceof HTTPException ? error.status : 500;
  const response = c.json(errorEnvelope('dependency_unavailable', 'An unexpected error occurred', requestId), status);
  response.headers.set('Cache-Control', 'no-store');
  return response;
});

export const mountPath = '/api/integrations/krabiclaw/v1';
export default app;
