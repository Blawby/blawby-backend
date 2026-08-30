import { OpenAPIHono } from '@hono/zod-openapi';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';

import { MAX_FACADE_BODY_BYTES } from '@/modules/krabiclaw-integration/config/body-limit';
import {
  KRABICLAW_MACHINE_AUTH_WWW_AUTHENTICATE,
  KrabiClawFacadeDisabledError,
  KrabiClawFacadeValidationError,
  KrabiClawMachineAuthError,
  KrabiClawPolicyForbiddenError,
  KrabiClawRateLimitedError,
  KrabiClawUpstreamDependencyError,
} from '@/modules/krabiclaw-integration/errors/facade-errors';
import {
  getConnectAccountHandler,
  getConnectStatusHandler,
  getPracticeDetailsHandler,
  patchPracticeDetailsHandler,
  postAccountSessionHandler,
  postConnectedAccountsHandler,
  postPracticeDetailsHandler,
} from '@/modules/krabiclaw-integration/handlers';
import {
  createEngagementContractHandler,
  getEngagementContractHandler,
  listEngagementContractsHandler,
  updateEngagementContractHandler,
  updateEngagementContractStatusHandler,
} from '@/modules/krabiclaw-integration/engagement-contracts.handlers';
import {
  getIntakeByRequestReferenceHandler,
  getIntakeHandler,
  getIntakeSettingsHandler,
  getIntakeStatusHandler,
  getPostPayStatusHandler,
  listIntakesHandler,
  patchIntakeTriageHandler,
  postCheckoutSessionHandler,
  postIntakesHandler,
} from '@/modules/krabiclaw-integration/intakes.handlers';
import { krabiclawFacadeValidationHook } from '@/modules/krabiclaw-integration/router/facade-validation-hook';
import {
  getConnectAccountRoute,
  getConnectStatusRoute,
  postAccountSessionRoute,
  postConnectedAccountsRoute,
} from '@/modules/krabiclaw-integration/routes/connect.routes';
import {
  createEngagementContractRoute,
  getEngagementContractRoute,
  listEngagementContractsRoute,
  updateEngagementContractRoute,
  updateEngagementContractStatusRoute,
} from '@/modules/krabiclaw-integration/routes/engagement-contracts.routes';
import {
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
import {
  getPracticeDetailsRoute,
  patchPracticeDetailsRoute,
  postPracticeDetailsRoute,
} from '@/modules/krabiclaw-integration/routes/practice.routes';
import { config } from '@/shared/config';
import type { AppContext } from '@/shared/types/hono';

const logger = getLogger(['modules', 'krabiclaw-integration', 'http']);

type KrabiClawFacadeApp = OpenAPIHono<AppContext>;

const errorEnvelope = (code: string, message: string, requestId: string | null) => ({
  error: { code, message },
  request_id: requestId,
});

/**
 * Global middleware, applied before any route-scoped
 * `createKrabiClawFacadeRouteMiddleware` gate:
 *
 * 1. `Cache-Control: no-store` on every response, success or failure (R22).
 * 2. The global kill switch (`KRABICLAW_FACADE_ENABLED`, default off — R17,
 *    AE5) — the ONLY thing the catch-all guard does per KTD2. Everything
 *    else (fixed-client/exact-scope/rollout-group, actor kind,
 *    trusted-header bounds, both rate-limit dimensions, D1 identity
 *    resolution) lives in route-scoped middleware attached to each
 *    registered route.
 * 3. A bounded request-body size limit (R23), before any route-scoped
 *    middleware — and therefore before D1 — runs; see `config/body-limit.ts`.
 *
 * Exported (rather than only called inline below) so a test can assemble
 * an equivalent app instance without depending on this module's own
 * already-finalized singleton — see `test/modules/krabiclaw-integration/http.test.ts`.
 */
const mountKrabiClawFacadeGlobalMiddleware = (app: KrabiClawFacadeApp): void => {
  app.use('*', async (c, next) => {
    try {
      return await next();
    } finally {
      c.res.headers.set('Cache-Control', 'no-store');
    }
  });

  app.use('*', (_c, next) => {
    if (!config.krabiclaw.facadeEnabled) {
      throw new KrabiClawFacadeDisabledError();
    }
    return next();
  });

  app.use(
    '*',
    bodyLimit({
      maxSize: MAX_FACADE_BODY_BYTES,
      onError: (c) => {
        const response = c.json(
          errorEnvelope('validation_failed', 'Request body exceeds the facade size bound', c.get('requestId') ?? null),
          400
        );
        response.headers.set('Cache-Control', 'no-store');
        return response;
      },
    })
  );
};

/**
 * Terminal handlers. **Must be mounted last** — after every route this app
 * registers — because Hono resolves an unmatched request against whichever
 * route was registered first among the ones that could match it; a
 * wildcard `app.all('*', ...)` registered before a specific route would
 * permanently shadow that route, not the other way around. `http.ts` calls
 * this once, at the very bottom of the file, after every `app.openapi(...)`
 * call U3/U4/U5 add above it in this same file.
 *
 * `app.notFound(...)` alone is not enough: it only fires when this sub-app's
 * own `fetch` handles the request directly (every test that queries this
 * app's `default` export without mounting it does). Hono's `route()` — what
 * U6 uses to mount this module under the parent app — copies this app's
 * routes onto the parent and drops the sub-app's `notFoundHandler`
 * entirely, so an unknown path under the mount path would otherwise fall
 * through to the parent app's own 404 instead of this module's reviewed
 * envelope. A terminal `app.all('*', ...)` is a normal route, not a
 * fallback hook, so it survives `route()` mounting. Both `notFound` and
 * this catch-all throw the same error so the two mounting paths (queried
 * directly, or mounted under a parent app) produce an identical response.
 */
const mountKrabiClawFacadeTerminalHandlers = (app: KrabiClawFacadeApp): void => {
  app.notFound(() => {
    throw new KrabiClawFacadeDisabledError();
  });
  app.all('*', () => {
    throw new KrabiClawFacadeDisabledError();
  });

  /**
   * Maps every thrown error to the Reviewed Error Contract's bounded
   * `{ error: { code, message }, request_id }` envelope. Only the policy
   * layer's own codes (`invalid_token`, `facade_forbidden`, `rate_limited`,
   * `validation_failed`, `invalid_upstream_response`,
   * `dependency_unavailable`) are handled here — the per-route-family
   * reserialization tables (KTD8) are owned by U3/U4/U5's route handlers,
   * which throw their own domain errors before this catches anything
   * unmapped.
   */
  app.onError((error, c) => {
    const requestId = c.get('requestId') ?? null;

    if (error instanceof KrabiClawFacadeDisabledError) {
      const response = c.json(errorEnvelope('facade_forbidden', 'Not found', requestId), 404);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    if (error instanceof KrabiClawMachineAuthError) {
      /**
       * Never surface which specific check failed (missing/expired/wrong-client/wrong-audience/etc.) — same
       * non-disclosure rule as the Facade policy family, just for the machine-auth discriminator instead.
       */
      const response = c.json(errorEnvelope('invalid_token', 'Machine authentication failed', requestId), 401);
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

    /**
     * Unknown/unmapped error: never pass through a raw exception body, and
     * never a raw upstream status paired with a code that doesn't match it
     * (R15, R25). An `HTTPException` with a 4xx status reads as an
     * unrecognized contract from a dependency — sanitize to `502
     * invalid_upstream_response`. Everything else (a 5xx `HTTPException`,
     * or a plain thrown `Error`/timeout/rejection with no status at all)
     * reads as the dependency itself being unavailable — sanitize to `503
     * dependency_unavailable`.
     */
    logger.error('krabiclaw facade unmapped error: {error}', {
      error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError' },
    });
    const isUnrecognizedUpstreamContract = error instanceof HTTPException && error.status >= 400 && error.status < 500;
    const status = isUnrecognizedUpstreamContract ? 502 : 503;
    const code = isUnrecognizedUpstreamContract ? 'invalid_upstream_response' : 'dependency_unavailable';
    const response = c.json(errorEnvelope(code, 'An unexpected error occurred', requestId), status);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  });
};

/**
 * A local `OpenAPIHono` instance rather than the shared `createHonoApp()`
 * factory — this module's `defaultHook` must emit the Reviewed Error
 * Contract envelope on a schema validation failure, not the shared,
 * differently-shaped `hasValidationErrors` body. See
 * `router/facade-validation-hook.ts`.
 */
const app: KrabiClawFacadeApp = new OpenAPIHono<AppContext>({ defaultHook: krabiclawFacadeValidationHook });

mountKrabiClawFacadeGlobalMiddleware(app);

/**
 * U3 (this unit): practice and Connect. Each route object already ran
 * through `registerFacadeRoute` at import time (in `routes/practice.routes.ts`
 * / `routes/connect.routes.ts`) so a route's method/path can't silently
 * disagree with its own `KrabiClawFacadeRouteDefinition`, guarded by
 * `createKrabiClawFacadeRouteMiddleware` (krabiclaw-facade.middleware.ts).
 * U4/U5 add their own route files' `app.openapi(...)` calls here too — every
 * one MUST be added above `mountKrabiClawFacadeTerminalHandlers(app)` below,
 * see that function's own doc comment for why.
 */
app.openapi(getPracticeDetailsRoute, getPracticeDetailsHandler);
app.openapi(postPracticeDetailsRoute, postPracticeDetailsHandler);
app.openapi(patchPracticeDetailsRoute, patchPracticeDetailsHandler);

app.openapi(postConnectedAccountsRoute, postConnectedAccountsHandler);
app.openapi(getConnectStatusRoute, getConnectStatusHandler);
app.openapi(postAccountSessionRoute, postAccountSessionHandler);
app.openapi(getConnectAccountRoute, getConnectAccountHandler);

/**
 * U4 (this unit): intakes. `getIntakeSettingsRoute` (`/intakes/settings`)
 * MUST be registered before `getIntakeRoute` (`/intakes/{uuid}`) — both are
 * two-segment GET routes and Hono matches in registration order, not by
 * static-vs-dynamic specificity (see `intakes.routes.ts`'s file-level doc
 * comment and `mountKrabiClawFacadeTerminalHandlers`'s doc comment above for
 * why this ordering constraint exists in Hono generally).
 */
app.openapi(getIntakeSettingsRoute, getIntakeSettingsHandler);
app.openapi(postIntakesRoute, postIntakesHandler);
app.openapi(getIntakeByRequestReferenceRoute, getIntakeByRequestReferenceHandler);
app.openapi(getIntakeStatusRoute, getIntakeStatusHandler);
app.openapi(listIntakesRoute, listIntakesHandler);
app.openapi(getIntakeRoute, getIntakeHandler);
app.openapi(patchIntakeTriageRoute, patchIntakeTriageHandler);
app.openapi(postCheckoutSessionRoute, postCheckoutSessionHandler);
app.openapi(getPostPayStatusRoute, getPostPayStatusHandler);

/** U5 (this unit): engagement contracts. No route-ordering hazard — every path here is either a distinct literal (`/engagement-contracts`) or has a unique trailing segment (`/{contract_id}`, `/{contract_id}/status`). */
app.openapi(createEngagementContractRoute, createEngagementContractHandler);
app.openapi(listEngagementContractsRoute, listEngagementContractsHandler);
app.openapi(getEngagementContractRoute, getEngagementContractHandler);
app.openapi(updateEngagementContractRoute, updateEngagementContractHandler);
app.openapi(updateEngagementContractStatusRoute, updateEngagementContractStatusHandler);

mountKrabiClawFacadeTerminalHandlers(app);

export const mountPath = '/api/integrations/krabiclaw/v1';
export { mountKrabiClawFacadeGlobalMiddleware, mountKrabiClawFacadeTerminalHandlers };
export default app;
