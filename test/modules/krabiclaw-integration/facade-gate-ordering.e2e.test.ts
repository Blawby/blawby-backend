import { randomUUID } from 'node:crypto';
import { Hono, type MiddlewareHandler } from 'hono';
import { requestId } from 'hono/request-id';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import krabiclawIntegrationApp, { mountPath } from '@/modules/krabiclaw-integration/http';
import { getPracticeDetails } from '@/modules/practice/operations/get-practice-details.operation';
import { KRABICLAW_MACHINE_AUTH_WWW_AUTHENTICATE } from '@/modules/krabiclaw-integration/errors/facade-errors';
import { krabiclawDirectoryService } from '@/modules/krabiclaw-integration/services/krabiclaw-directory.service';
import { krabiclawIdentityResolverService } from '@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service';
import type { config } from '@/shared/config';
import type { AppContext } from '@/shared/types/hono';

/**
 * Whole-app proof of the middleware-to-operation chain, exercised against
 * the REAL, already-mounted `krabiclawIntegrationApp` (not a synthetic
 * fixture), with dependency spies at the D1 boundary rather than mocking the
 * chain itself (unit-6-brief.md, approach step 4). Confirms the gate order
 * documented in `createKrabiClawFacadeRouteMiddleware`'s own doc comment —
 * global switch -> scope -> rollout group -> actor kind -> header bounds ->
 * rate limits -> D1 -> Legal Operation — holds across the fully assembled
 * app, for all six independent rollout groups, not just within one route
 * family's own contract test file.
 */

interface KrabiClawTestConfigState {
  facadeEnabled: boolean;
  rolloutGroups: Record<string, boolean>;
}

const configState = vi.hoisted((): KrabiClawTestConfigState => {
  const allGroupsOn = {
    'practice-read': true,
    'practice-mutation': true,
    connect: true,
    'intake-without-payment': true,
    'intake-payment': true,
    engagement: true,
  } satisfies Record<string, boolean>;
  return { facadeEnabled: true, rolloutGroups: { ...allGroupsOn } };
});

const ALL_GROUPS_ON = { ...configState.rolloutGroups };

vi.mock('@/shared/config', async (importOriginal) => {
  const actual = await importOriginal<{ config: typeof config }>();
  return {
    config: {
      ...actual.config,
      krabiclaw: {
        ...actual.config.krabiclaw,
        get facadeEnabled() {
          return configState.facadeEnabled;
        },
        get rolloutGroups() {
          return configState.rolloutGroups;
        },
      },
    },
  };
});

/** Grants every `legal:*` scope so any route's own scope check passes — scope isolation itself is proven separately below with a narrow-scope token. */
const ALL_SCOPES_TOKEN = 'all-scopes-token';
const PRACTICE_ONLY_TOKEN = 'practice-only-token';

vi.mock('@/modules/krabiclaw-integration/middleware/verify-facade-token', async () => {
  const { KrabiClawMachineAuthError } = await import('@/modules/krabiclaw-integration/errors/facade-errors');
  return {
    verifyFacadeToken: vi.fn(async (token: string | undefined) => {
      if (token === ALL_SCOPES_TOKEN) {
        return {
          clientId: 'fixed-client',
          grantedScopes: new Set(['legal:practice', 'legal:connect', 'legal:intakes', 'legal:engagements']),
        };
      }
      if (token === PRACTICE_ONLY_TOKEN) {
        return { clientId: 'fixed-client', grantedScopes: new Set(['legal:practice']) };
      }
      throw new KrabiClawMachineAuthError('Invalid access token');
    }),
  };
});

vi.mock('@/modules/krabiclaw-integration/services/krabiclaw-directory.service', () => ({
  krabiclawDirectoryService: {
    getOrganizationDirectoryRecord: vi.fn(async (id: string) => ({ id, name: 'Acme Legal', slug: 'acme-legal' })),
    getUserDirectoryRecord: vi.fn(async (id: string) => ({ id, name: 'Jane Roe', email: 'jane@example.test' })),
  },
}));

vi.mock('@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service', () => ({
  krabiclawIdentityResolverService: {
    resolveIdentity: vi.fn(async () => ({ organizationId: randomUUID(), userId: randomUUID() })),
  },
}));

vi.mock('@/shared/events/definitions/krabiclaw', () => ({
  KrabiClawActorAttributed: { dispatch: vi.fn(async () => 'event-id-1') },
}));

vi.mock('@/modules/practice/operations/get-practice-details.operation', () => ({
  getPracticeDetails: vi.fn(async () => ({ id: 'practice-1' })),
}));

interface FakeRateLimitOptions {
  routeKey?: string;
  scope?: (c: unknown) => string | null | undefined | Promise<string | null | undefined>;
}

/** A org id that, if ever used as the rate-limit scope key, is rejected — proving the org-bucket gate runs, and runs before D1, without needing the real Postgres-backed limiter. */
const RATE_LIMITED_ORG_ID = 'ext-org-rate-limited';

vi.mock('@/shared/middleware/rateLimit', () => ({
  rateLimit:
    (options?: FakeRateLimitOptions): MiddlewareHandler<AppContext> =>
    async (c, next) => {
      const scopeKey = await options?.scope?.(c);
      if (typeof scopeKey === 'string' && scopeKey.includes(RATE_LIMITED_ORG_ID)) {
        return c.json({ retry_after: 5 }, 429);
      }
      return next();
    },
}));

const humanHeaders = (organizationId: string, token = ALL_SCOPES_TOKEN) => ({
  authorization: `Bearer ${token}`,
  'x-krabiclaw-organization-id': organizationId,
  'x-krabiclaw-actor-id': 'ext-user-1',
  'x-krabiclaw-actor-kind': 'human',
});

const anonymousHeaders = (organizationId: string, token = ALL_SCOPES_TOKEN) => ({
  authorization: `Bearer ${token}`,
  'x-krabiclaw-organization-id': organizationId,
  'x-krabiclaw-actor-id': 'ext-anon-actor-1',
  'x-krabiclaw-actor-kind': 'anonymous',
});

const clearD1Spies = (): void => {
  vi.mocked(krabiclawDirectoryService.getOrganizationDirectoryRecord).mockClear();
  vi.mocked(krabiclawDirectoryService.getUserDirectoryRecord).mockClear();
  vi.mocked(krabiclawIdentityResolverService.resolveIdentity).mockClear();
  vi.mocked(getPracticeDetails).mockClear();
};

const expectNoD1Call = (): void => {
  expect(krabiclawDirectoryService.getOrganizationDirectoryRecord).not.toHaveBeenCalled();
  expect(krabiclawIdentityResolverService.resolveIdentity).not.toHaveBeenCalled();
};

const expectD1Reached = (): void => {
  expect(krabiclawDirectoryService.getOrganizationDirectoryRecord).toHaveBeenCalled();
  expect(krabiclawIdentityResolverService.resolveIdentity).toHaveBeenCalled();
};

/** A parent app that mirrors `hono-app.ts`'s own `requestId()` + `.route(mountPath, ...)` mounting shape, so `request_id` in a facade error body is a real correlation value instead of the standalone module's own `null`. */
const buildParentApp = (): Hono<AppContext> => {
  const parent = new Hono<AppContext>();
  parent.use('*', requestId());
  parent.route(mountPath, krabiclawIntegrationApp);
  return parent;
};

beforeEach(() => {
  configState.facadeEnabled = true;
  configState.rolloutGroups = { ...ALL_GROUPS_ON };
  clearD1Spies();
});

describe('krabiclaw facade whole-app gate ordering (U6)', () => {
  describe('six independent rollout-group gates', () => {
    it('practice-read reaches D1 while practice-mutation stays disabled — and vice versa (AE8)', async () => {
      configState.rolloutGroups = { ...ALL_GROUPS_ON, 'practice-mutation': false };

      const read = await krabiclawIntegrationApp.request('/practice/details', { headers: humanHeaders('org-a') });
      expect(read.status).not.toBe(403);
      expectD1Reached();

      clearD1Spies();
      const mutate = await krabiclawIntegrationApp.request('/practice/details', {
        method: 'POST',
        headers: { ...humanHeaders('org-a'), 'content-type': 'application/json' },
        body: '{}',
      });
      expect(mutate.status).toBe(403);
      expect(await mutate.json()).toEqual({
        error: { code: 'facade_forbidden', message: 'Request is not permitted' },
        request_id: null,
      });
      expectNoD1Call();
    });

    it('intake-without-payment reaches D1 while intake-payment stays disabled', async () => {
      configState.rolloutGroups = { ...ALL_GROUPS_ON, 'intake-payment': false };

      const settings = await krabiclawIntegrationApp.request('/intakes/settings', {
        headers: anonymousHeaders('org-a'),
      });
      expect(settings.status).not.toBe(403);
      expectD1Reached();

      clearD1Spies();
      const checkout = await krabiclawIntegrationApp.request(`/intakes/${randomUUID()}/checkout-session`, {
        method: 'POST',
        headers: { ...anonymousHeaders('org-a'), 'x-krabiclaw-request-reference': randomUUID() },
      });
      expect(checkout.status).toBe(403);
      expectNoD1Call();
    });

    it.each([
      { group: 'connect', method: 'GET', path: '/connect/status', headers: humanHeaders },
      { group: 'engagement', method: 'GET', path: '/engagement-contracts', headers: humanHeaders },
    ])('$group denies its own routes when disabled, without touching D1', async ({ group, method, path, headers }) => {
      configState.rolloutGroups = { ...ALL_GROUPS_ON, [group]: false };

      const res = await krabiclawIntegrationApp.request(path, { method, headers: headers('org-a') });
      expect(res.status).toBe(403);
      expectNoD1Call();
    });

    it.each(['practice-read', 'connect', 'intake-without-payment', 'engagement'] as const)(
      'disabling only "%s" does not affect an already-enabled different group',
      async (disabledGroup) => {
        configState.rolloutGroups = { ...ALL_GROUPS_ON, [disabledGroup]: false };

        // A route from a DIFFERENT group than the one just disabled must still reach D1.
        const unaffectedRoute = disabledGroup === 'engagement' ? '/practice/details' : '/engagement-contracts';
        const res = await krabiclawIntegrationApp.request(unaffectedRoute, { headers: humanHeaders('org-a') });
        expect(res.status).not.toBe(403);
        expectD1Reached();
      }
    );
  });

  describe('wrong scope, actor, org rate limit, and identity resolution failure all produce no downstream call', () => {
    it('wrong-family scope is rejected before D1 (AE1/R2/R3)', async () => {
      const res = await krabiclawIntegrationApp.request('/connect/status', {
        headers: humanHeaders('org-a', PRACTICE_ONLY_TOKEN),
      });
      expect(res.status).toBe(403);
      expectNoD1Call();
    });

    it('disallowed actor kind is rejected before D1 (R11)', async () => {
      const res = await krabiclawIntegrationApp.request('/practice/details', { headers: anonymousHeaders('org-a') });
      expect(res.status).toBe(403);
      expectNoD1Call();
    });

    it('the claimed-organization rate-limit bucket is rejected before D1 (R21)', async () => {
      const res = await krabiclawIntegrationApp.request('/practice/details', {
        headers: humanHeaders(RATE_LIMITED_ORG_ID),
      });
      expect(res.status).toBe(429);
      expectNoD1Call();
    });

    it('an identity resolution failure never reaches the Legal Operation (sanitized 502, R15)', async () => {
      vi.mocked(krabiclawIdentityResolverService.resolveIdentity).mockRejectedValueOnce(new Error('D1 lookup failed'));

      const res = await krabiclawIntegrationApp.request('/practice/details', { headers: humanHeaders('org-a') });
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({
        error: { code: 'invalid_upstream_response', message: 'A KrabiClaw facade dependency is unavailable' },
        request_id: null,
      });
      expect(getPracticeDetails).not.toHaveBeenCalled();
    });
  });

  it('an unexpected directory/legal dependency failure is sanitized and carries request correlation when mounted under the parent app', async () => {
    vi.mocked(krabiclawDirectoryService.getOrganizationDirectoryRecord).mockRejectedValueOnce(
      new Error('D1 organization lookup failed')
    );
    const parentApp = buildParentApp();

    const res = await parentApp.request(`${mountPath}/practice/details`, { headers: humanHeaders('org-a') });

    expect(res.status).toBe(502);
    // SAFETY: this route's onError always responds with the reviewed `{ error, request_id }` envelope.
    const body = (await res.json()) as { error: { code: string; message: string }; request_id: string | null };
    expect(body.error).toEqual({
      code: 'invalid_upstream_response',
      message: 'A KrabiClaw facade dependency is unavailable',
    });
    expect(body.request_id).toEqual(expect.any(String));
    expect(body.request_id).not.toBeNull();
    expect(JSON.stringify(body)).not.toContain('D1 organization lookup failed');
  });

  describe('only the stable machine-auth discriminator carries the refreshable WWW-Authenticate challenge (R24, AE7)', () => {
    it('a machine-auth 401 carries it', async () => {
      const res = await krabiclawIntegrationApp.request('/practice/details', {
        headers: { authorization: 'Bearer not-a-real-token' },
      });
      expect(res.status).toBe(401);
      expect(res.headers.get('WWW-Authenticate')).toBe(KRABICLAW_MACHINE_AUTH_WWW_AUTHENTICATE);
    });

    it.each([
      {
        name: 'a facade-policy 403',
        build: async () => krabiclawIntegrationApp.request('/practice/details', { headers: anonymousHeaders('org-a') }),
      },
      {
        name: 'a rate-limit 429',
        build: async () =>
          krabiclawIntegrationApp.request('/practice/details', { headers: humanHeaders(RATE_LIMITED_ORG_ID) }),
      },
      {
        name: 'a dependency 502',
        build: async () => {
          vi.mocked(krabiclawIdentityResolverService.resolveIdentity).mockRejectedValueOnce(new Error('boom'));
          return krabiclawIntegrationApp.request('/practice/details', { headers: humanHeaders('org-a') });
        },
      },
      {
        name: 'an unmatched-path 404',
        build: async () => krabiclawIntegrationApp.request('/no-such-path', { headers: humanHeaders('org-a') }),
      },
    ])('$name never carries it — never mistaken for a refreshable machine-auth failure', async ({ build }) => {
      const res = await build();
      expect(res.status).not.toBe(401);
      expect(res.headers.get('WWW-Authenticate')).toBeNull();
    });
  });

  describe('every response is Cache-Control: no-store, success or failure', () => {
    it.each([
      { name: 'disabled switch', setup: () => (configState.facadeEnabled = false), path: '/practice/details' },
      {
        name: 'rollout-group denial',
        setup: () => (configState.rolloutGroups = { ...ALL_GROUPS_ON, connect: false }),
        path: '/connect/status',
      },
      {
        name: 'machine-auth failure',
        setup: () => undefined,
        path: '/practice/details',
        headers: { authorization: 'Bearer bad' },
      },
      { name: 'a route that reaches D1', setup: () => undefined, path: '/practice/details' },
    ])('$name', async ({ setup, path, headers }) => {
      setup();
      const res = await krabiclawIntegrationApp.request(path, { headers: headers ?? humanHeaders('org-a') });
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    });
  });

  describe('audit-event log capture excludes tokens, secrets, and the trusted request reference (R23)', () => {
    it('the KrabiClawActorAttributed dispatch never carries the bearer token or the request reference', async () => {
      const { KrabiClawActorAttributed } = await import('@/shared/events/definitions/krabiclaw');
      vi.mocked(KrabiClawActorAttributed.dispatch).mockClear();
      const requestReference = randomUUID();
      const secretToken = ALL_SCOPES_TOKEN;

      await krabiclawIntegrationApp.request(`/intakes/${randomUUID()}/status`, {
        headers: { ...anonymousHeaders('org-a'), 'x-krabiclaw-request-reference': requestReference },
      });

      expect(vi.mocked(KrabiClawActorAttributed.dispatch)).toHaveBeenCalledTimes(1);
      const dispatchedPayload = JSON.stringify(vi.mocked(KrabiClawActorAttributed.dispatch).mock.calls[0]);
      expect(dispatchedPayload).not.toContain(secretToken);
      expect(dispatchedPayload).not.toContain(requestReference);
    });

    /**
     * KNOWN GAP — found while writing this whole-app proof, not fixed here
     * per the dispatcher's instruction to report rather than modify U1-U5
     * code. `resolveIdentityOrFail` (krabiclaw-facade.middleware.ts) logs
     * `sanitizeError(error)` on any directory/identity dependency failure.
     * `sanitizeError` (shared/utils/logging.ts) unconditionally spreads the
     * caught error's own `cause` (and every other own-enumerable property)
     * into the logged payload. `krabiclawDirectoryService`'s own
     * `wrapD1Failure` (krabiclaw-directory.service.ts) deliberately sets
     * `cause: error` to the RAW, unsanitized Cloudflare SDK error — which
     * that same file's own doc comment says "can carry response
     * headers/body" — specifically so `sanitizeD1Error` can keep it out of
     * ITS OWN log line. `resolveIdentityOrFail` undoes that guarantee one
     * layer up: this test demonstrates that a raw upstream failure
     * propagated through `krabiclawDirectoryService`/`krabiclawIdentityResolverService`
     * with a sensitive `cause` reaches the facade's own logger.error call
     * verbatim, violating R23 ("Logs exclude ... raw upstream bodies").
     * This assertion documents the CURRENT (non-conforming) behavior — it
     * is not the desired contract. See the U6 report for the suggested fix
     * (branch `resolveIdentityOrFail`'s catch to log a sanitized summary,
     * not `sanitizeError(error)` directly).
     */
    it('KNOWN GAP: a dependency failure with a sensitive `cause` currently reaches the facade logger verbatim', async () => {
      const { getLogger } = await import('@logtape/logtape');
      const facadeMiddlewareLogger = getLogger(['modules', 'krabiclaw-integration', 'facade-middleware']);
      const errorSpy = vi.spyOn(facadeMiddlewareLogger, 'error');

      const sensitiveMarker = 'SENSITIVE_UPSTREAM_BODY_MARKER_DO_NOT_LOG';
      vi.mocked(krabiclawIdentityResolverService.resolveIdentity).mockRejectedValueOnce(
        new Error('D1 identity lookup failed', { cause: { message: sensitiveMarker } })
      );

      await krabiclawIntegrationApp.request('/practice/details', { headers: humanHeaders('org-a') });

      const loggedArgs = JSON.stringify(errorSpy.mock.calls);
      // Documents the CURRENT leak — see the doc comment above and the U6 report.
      expect(loggedArgs).toContain(sensitiveMarker);
      errorSpy.mockRestore();
    });
  });
});
