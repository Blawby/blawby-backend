import { OpenAPIHono, z } from '@hono/zod-openapi';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it, vi } from 'vitest';

import krabiclawIntegrationApp, {
  mountKrabiClawFacadeGlobalMiddleware,
  mountKrabiClawFacadeTerminalHandlers,
  mountPath,
} from '@/modules/krabiclaw-integration/http';
import { createKrabiClawFacadeRouteMiddleware } from '@/modules/krabiclaw-integration/middleware/krabiclaw-facade.middleware';
import { verifyFacadeToken } from '@/modules/krabiclaw-integration/middleware/verify-facade-token';
import { registerFacadeRoute, resetFacadeRouteRegistryForTests } from '@/modules/krabiclaw-integration/route-registry';
import { krabiclawFacadeValidationHook } from '@/modules/krabiclaw-integration/router/facade-validation-hook';
import { krabiclawDirectoryService } from '@/modules/krabiclaw-integration/services/krabiclaw-directory.service';
import { krabiclawIdentityResolverService } from '@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service';
import type { KrabiClawFacadeRouteDefinition } from '@/modules/krabiclaw-integration/types/route-policy.types';
import { krabiclawStrictSchema } from '@/modules/krabiclaw-integration/validations/facade-schema.helpers';
import type { config } from '@/shared/config';
import { routeBuilder } from '@/shared/router/route-builder';
import type { AppContext } from '@/shared/types/hono';

const configState = vi.hoisted(() => ({
  facadeEnabled: false,
  rolloutGroups: {
    'practice-read': true,
    'practice-mutation': true,
    connect: true,
    'intake-without-payment': true,
    'intake-payment': true,
    engagement: true,
  },
}));

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

const VALID_TOKEN = 'legal:practice';

vi.mock('@/modules/krabiclaw-integration/middleware/verify-facade-token', async () => {
  const { KrabiClawMachineAuthError } = await import('@/modules/krabiclaw-integration/errors/facade-errors');
  return {
    verifyFacadeToken: vi.fn(async (token: string | undefined) => {
      if (token !== VALID_TOKEN) {
        throw new KrabiClawMachineAuthError('Invalid access token');
      }
      return { clientId: 'fixed-client', grantedScopes: new Set(['legal:practice']) };
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
    resolveIdentity: vi.fn(async () => ({ organizationId: 'local-org-1', userId: null })),
  },
}));

vi.mock('@/shared/events/definitions/krabiclaw', () => ({
  KrabiClawActorAttributed: { dispatch: vi.fn(async () => 'event-id-1') },
}));

vi.mock('@/shared/middleware/rateLimit', () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

const anonymousHeaders = (organizationId: string) => ({
  authorization: `Bearer ${VALID_TOKEN}`,
  'x-krabiclaw-organization-id': organizationId,
  'x-krabiclaw-actor-id': 'ext-anon-actor-1',
  'x-krabiclaw-actor-kind': 'anonymous',
});

const humanHeaders = {
  authorization: `Bearer ${VALID_TOKEN}`,
  'x-krabiclaw-organization-id': 'ext-org-1',
  'x-krabiclaw-actor-id': 'ext-user-1',
  'x-krabiclaw-actor-kind': 'human',
};

/**
 * The exact 21-route allowlist from the Product Contract's Route Contract
 * table (global-context.md), one entry per real, already-mounted U3/U4/U5
 * route. `path` uses a placeholder UUID/segment for every `{param}` so a
 * single fetch shape works for every entry — irrelevant while the kill
 * switch is off, since `mountKrabiClawFacadeGlobalMiddleware`'s disabled
 * check throws on `app.use('*', ...)` before Hono ever attempts to match a
 * specific route or validate a param (see `http.ts`).
 */
const ALL_ALLOWLISTED_ROUTES: readonly { method: string; path: string }[] = [
  { method: 'GET', path: '/practice/details' },
  { method: 'POST', path: '/practice/details' },
  { method: 'PATCH', path: '/practice/details' },
  { method: 'POST', path: '/connect/connected-accounts' },
  { method: 'GET', path: '/connect/status' },
  { method: 'POST', path: '/connect/account-session' },
  { method: 'GET', path: '/connect/account' },
  { method: 'GET', path: '/intakes/settings' },
  { method: 'POST', path: '/intakes' },
  { method: 'GET', path: '/intakes/requests/req-ref-1' },
  { method: 'GET', path: '/intakes/11111111-1111-4111-8111-111111111111/status' },
  { method: 'GET', path: '/intakes' },
  { method: 'GET', path: '/intakes/11111111-1111-4111-8111-111111111111' },
  { method: 'PATCH', path: '/intakes/11111111-1111-4111-8111-111111111111/triage' },
  { method: 'POST', path: '/intakes/11111111-1111-4111-8111-111111111111/checkout-session' },
  { method: 'GET', path: '/intakes/11111111-1111-4111-8111-111111111111/post-pay/status' },
  { method: 'POST', path: '/engagement-contracts' },
  { method: 'GET', path: '/engagement-contracts' },
  { method: 'GET', path: '/engagement-contracts/22222222-2222-4222-8222-222222222222' },
  { method: 'PATCH', path: '/engagement-contracts/22222222-2222-4222-8222-222222222222' },
  { method: 'PATCH', path: '/engagement-contracts/22222222-2222-4222-8222-222222222222/status' },
];

describe('krabiclaw-integration http.ts', () => {
  it("exports the route scope table's base path as its mount path", () => {
    expect(mountPath).toBe('/api/integrations/krabiclaw/v1');
  });

  it.each(ALL_ALLOWLISTED_ROUTES)(
    '404s $method $path while the kill switch is off, proving every allowlisted route is denied (R17, AE5)',
    async ({ method, path }) => {
      const res = await krabiclawIntegrationApp.request(path, {
        method,
        headers: { ...humanHeaders, 'content-type': 'application/json' },
        body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
      });
      expect(res.status).toBe(404);
    }
  );

  it('returns the reviewed facade_forbidden envelope, not the raw dependency 404 body, when the switch is off', async () => {
    const res = await krabiclawIntegrationApp.request('/practice/details', { headers: anonymousHeaders('ext-org-1') });
    expect(await res.json()).toEqual({ error: { code: 'facade_forbidden', message: 'Not found' }, request_id: null });
  });

  it('marks every response Cache-Control: no-store, including the disabled-switch 404 (R22)', async () => {
    const res = await krabiclawIntegrationApp.request('/practice/details', { headers: anonymousHeaders('ext-org-1') });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('marks an unmatched-path 404 Cache-Control: no-store even when the switch is on', async () => {
    configState.facadeEnabled = true;
    try {
      const res = await krabiclawIntegrationApp.request('/no-such-path', { headers: anonymousHeaders('ext-org-1') });
      expect(res.status).toBe(404);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    } finally {
      configState.facadeEnabled = false;
    }
  });

  it('never verifies the token when the kill switch is off', async () => {
    vi.mocked(verifyFacadeToken).mockClear();

    await krabiclawIntegrationApp.request('/practice/details', { headers: anonymousHeaders('ext-org-1') });

    expect(verifyFacadeToken).not.toHaveBeenCalled();
  });

  it('gets the same reviewed facade envelope for an unknown path when mounted under a parent app via .route() (the U6 mounting pattern)', async () => {
    configState.facadeEnabled = true;
    try {
      const parentApp = new Hono();
      parentApp.route(mountPath, krabiclawIntegrationApp);

      const res = await parentApp.request(`${mountPath}/no-such-path`, { headers: anonymousHeaders('ext-org-1') });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: { code: 'facade_forbidden', message: 'Not found' }, request_id: null });
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    } finally {
      configState.facadeEnabled = false;
    }
  });

  /**
   * This describe block is the worked example: a fresh app assembled the
   * exact same way `http.ts` assembles its own default export
   * (`mountKrabiClawFacadeGlobalMiddleware` → routes → `registerFacadeRoute`
   * → `mountKrabiClawFacadeTerminalHandlers`), rather than mutating the
   * already-finalized production singleton — its own terminal wildcard
   * route would shadow anything appended after import (see
   * `mountKrabiClawFacadeTerminalHandlers`'s doc comment in `http.ts`).
   */
  describe('a route registered against the policy layer (the U3/U4/U5 integration pattern)', () => {
    resetFacadeRouteRegistryForTests();

    const readDefinition: KrabiClawFacadeRouteDefinition = {
      method: 'get',
      path: '/practice/details',
      scope: 'legal:practice',
      actorPolicy: 'human',
      rateFamily: 'practice',
      rolloutGroup: 'practice-read',
      requestReferencePolicy: 'none',
    };

    const mutationDefinition: KrabiClawFacadeRouteDefinition = {
      method: 'post',
      path: '/practice/details',
      scope: 'legal:practice',
      actorPolicy: 'human',
      rateFamily: 'practice',
      rolloutGroup: 'practice-mutation',
      requestReferencePolicy: 'none',
    };

    const strayErrorDefinition: KrabiClawFacadeRouteDefinition = {
      method: 'get',
      path: '/practice/stray-error',
      scope: 'legal:practice',
      actorPolicy: 'human',
      rateFamily: 'practice',
      rolloutGroup: 'practice-read',
      requestReferencePolicy: 'none',
    };

    const exampleApp = new OpenAPIHono<AppContext>({ defaultHook: krabiclawFacadeValidationHook });
    mountKrabiClawFacadeGlobalMiddleware(exampleApp);

    const readRoute = routeBuilder.build({
      method: readDefinition.method,
      path: readDefinition.path,
      middleware: [createKrabiClawFacadeRouteMiddleware(readDefinition)],
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } },
      },
    });
    registerFacadeRoute(readRoute, readDefinition); // Throws immediately on a method/path mismatch or duplicate.
    exampleApp.openapi(readRoute, (c) => c.json({ ok: true }));

    const mutationBodySchema = krabiclawStrictSchema({ name: z.string().min(1).max(50) });
    const mutationRoute = routeBuilder.build({
      method: mutationDefinition.method,
      path: mutationDefinition.path,
      middleware: [createKrabiClawFacadeRouteMiddleware(mutationDefinition)],
      request: { body: { content: { 'application/json': { schema: mutationBodySchema } } } },
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } },
      },
    });
    registerFacadeRoute(mutationRoute, mutationDefinition);
    exampleApp.openapi(mutationRoute, (c) => c.json({ ok: true }));

    const strayErrorRoute = routeBuilder.build({
      method: strayErrorDefinition.method,
      path: strayErrorDefinition.path,
      middleware: [createKrabiClawFacadeRouteMiddleware(strayErrorDefinition)],
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } },
      },
    });
    registerFacadeRoute(strayErrorRoute, strayErrorDefinition);
    exampleApp.openapi(strayErrorRoute, () => {
      // Simulates a future unit's route handler letting an unmapped domain error escape instead of reserializing it per its own route family's KTD8 contract.
      throw new HTTPException(409, { message: 'stray domain conflict — must never reach the client verbatim' });
    });

    mountKrabiClawFacadeTerminalHandlers(exampleApp);

    it('reaches the handler once every policy gate passes, and the response still carries Cache-Control: no-store', async () => {
      configState.facadeEnabled = true;
      try {
        const res = await exampleApp.request('/practice/details', { headers: humanHeaders });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
        expect(res.headers.get('Cache-Control')).toBe('no-store');
      } finally {
        configState.facadeEnabled = false;
      }
    });

    it('never invokes D1/PostgreSQL identity resolution when the request is rejected before that gate', async () => {
      configState.facadeEnabled = true;
      vi.mocked(krabiclawDirectoryService.getOrganizationDirectoryRecord).mockClear();
      vi.mocked(krabiclawIdentityResolverService.resolveIdentity).mockClear();

      try {
        const res = await exampleApp.request('/practice/details', { headers: anonymousHeaders('ext-org-1') });
        // Human-only route, anonymous actor → rejected by the actor-kind gate.
        expect(res.status).toBe(403);
        expect(krabiclawDirectoryService.getOrganizationDirectoryRecord).not.toHaveBeenCalled();
        expect(krabiclawIdentityResolverService.resolveIdentity).not.toHaveBeenCalled();
      } finally {
        configState.facadeEnabled = false;
      }
    });

    it('carries the reviewed WWW-Authenticate challenge on a machine-auth failure (R24)', async () => {
      configState.facadeEnabled = true;
      try {
        const res = await exampleApp.request('/practice/details', {
          headers: { authorization: 'Bearer not-the-valid-token' },
        });
        expect(res.status).toBe(401);
        expect(res.headers.get('WWW-Authenticate')).toBe('Bearer realm="krabiclaw-facade", error="invalid_token"');
        expect(await res.json()).toMatchObject({ error: { code: 'invalid_token' } });
      } finally {
        configState.facadeEnabled = false;
      }
    });

    it('returns the reviewed validation_failed envelope — not the raw Zod issue shape — for a malformed request body', async () => {
      configState.facadeEnabled = true;
      try {
        const res = await exampleApp.request('/practice/details', {
          method: 'POST',
          headers: { ...humanHeaders, 'content-type': 'application/json' },
          body: JSON.stringify({}), // Missing required `name`.
        });
        expect(res.status).toBe(400);
        // SAFETY: this route's onError always responds with the reviewed `{ error, request_id }` envelope.
        const body = (await res.json()) as { error: { code: string; message: string }; request_id: string | null };
        expect(body).toEqual({
          error: { code: 'validation_failed', message: 'Request failed facade validation' },
          request_id: null,
        });
        // The shared hasValidationErrors hook would have put a `details` array with raw Zod issue paths here — confirm it's gone.
        expect(body).not.toHaveProperty('details');
        expect(res.headers.get('Cache-Control')).toBe('no-store');
      } finally {
        configState.facadeEnabled = false;
      }
    });

    it('rejects an oversized request body before any route-scoped middleware runs (R23)', async () => {
      configState.facadeEnabled = true;
      vi.mocked(verifyFacadeToken).mockClear();
      try {
        const oversizedBody = JSON.stringify({ name: 'x'.repeat(200_000) });
        const res = await exampleApp.request('/practice/details', {
          method: 'POST',
          headers: { ...humanHeaders, 'content-type': 'application/json' },
          body: oversizedBody,
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ error: { code: 'validation_failed' } });
        // The body-size gate is global middleware, ahead of the route-scoped gate that verifies the token.
        expect(verifyFacadeToken).not.toHaveBeenCalled();
      } finally {
        configState.facadeEnabled = false;
      }
    });

    it('sanitizes a stray unmapped HTTPException(409) from a route handler to 502 invalid_upstream_response, never passing its message through', async () => {
      configState.facadeEnabled = true;
      try {
        const res = await exampleApp.request('/practice/stray-error', { headers: humanHeaders });
        expect(res.status).toBe(502);
        // SAFETY: this route's onError always responds with the reviewed `{ error, request_id }` envelope.
        const body = (await res.json()) as { error: { code: string; message: string }; request_id: string | null };
        expect(body).toEqual({
          error: { code: 'invalid_upstream_response', message: 'An unexpected error occurred' },
          request_id: null,
        });
        expect(JSON.stringify(body)).not.toContain('stray domain conflict');
      } finally {
        configState.facadeEnabled = false;
      }
    });
  });
});
