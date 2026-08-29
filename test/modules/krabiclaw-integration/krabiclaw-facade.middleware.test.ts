import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it, vi } from 'vitest';

import { createKrabiClawFacadeRouteMiddleware } from '@/modules/krabiclaw-integration/middleware/krabiclaw-facade.middleware';
import { krabiclawDirectoryService } from '@/modules/krabiclaw-integration/services/krabiclaw-directory.service';
import { krabiclawIdentityResolverService } from '@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service';
import type { KrabiClawFacadeRouteDefinition } from '@/modules/krabiclaw-integration/types/route-policy.types';
import type { config } from '@/shared/config';
import type { AppContext } from '@/shared/types/hono';

const configState = vi.hoisted(() => ({
  facadeEnabled: true,
  oauthClientId: 'fixed-client',
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
        get oauthClientId() {
          return configState.oauthClientId;
        },
        get rolloutGroups() {
          return configState.rolloutGroups;
        },
      },
    },
  };
});

// Test-only token format: comma-separated legal scopes, e.g. "legal:practice,legal:connect".
// Keeps every gate-ordering assertion legible without standing up real JWTs (verify-facade-token.test.ts covers real tokens).
vi.mock('@/modules/krabiclaw-integration/middleware/verify-facade-token', () => ({
  verifyFacadeToken: vi.fn(async (token: string | undefined) => {
    if (!token) {
      throw new Error('unexpected missing token in fixture');
    }
    if (token === 'invalid') {
      const { KrabiClawMachineAuthError } = await import('@/modules/krabiclaw-integration/errors/facade-errors');
      throw new KrabiClawMachineAuthError('Invalid access token');
    }
    return { clientId: 'fixed-client', grantedScopes: new Set(token.split(',')) };
  }),
}));

vi.mock('@/modules/krabiclaw-integration/services/krabiclaw-directory.service', () => ({
  krabiclawDirectoryService: {
    getOrganizationDirectoryRecord: vi.fn(async (id: string) => ({ id, name: 'Acme Legal', slug: 'acme-legal' })),
    getUserDirectoryRecord: vi.fn(async (id: string) => ({ id, name: 'Jane Roe', email: 'jane@example.test' })),
  },
}));

vi.mock('@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service', () => ({
  krabiclawIdentityResolverService: {
    resolveIdentity: vi.fn(async ({ actorKind }: { actorKind: string }) => ({
      organizationId: 'local-org-1',
      userId: actorKind === 'human' ? 'local-user-1' : null,
    })),
  },
}));

const dispatchMock = vi.hoisted(() => vi.fn(async () => 'event-id-1'));
vi.mock('@/shared/events/definitions/krabiclaw', () => ({
  KrabiClawActorAttributed: { dispatch: dispatchMock },
}));

const rateLimitState = vi.hoisted(() => ({ blockedKeys: new Set<string>() }));

interface FakeRateLimitOptions {
  routeKey?: string;
  scope?: (c: Context<AppContext>) => string | null | undefined;
}

vi.mock('@/shared/middleware/rateLimit', () => ({
  rateLimit:
    (options?: FakeRateLimitOptions): MiddlewareHandler<AppContext> =>
    async (c, next) => {
      const identifier = options?.scope?.(c);
      const key = `${options?.routeKey ?? 'global'}:${identifier ?? ''}`;
      if (identifier && rateLimitState.blockedKeys.has(key)) {
        return c.json({ error: 'Too Many Requests', message: 'Too many requests.', retry_after: 7 }, 429);
      }
      return next();
    },
}));

const PRACTICE_DETAILS: KrabiClawFacadeRouteDefinition = {
  method: 'get',
  path: '/practice/details',
  scope: 'legal:practice',
  actorPolicy: 'human',
  rateFamily: 'practice',
  rolloutGroup: 'practice-read',
  requestReferencePolicy: 'none',
};

const PRACTICE_DETAILS_MUTATION: KrabiClawFacadeRouteDefinition = {
  method: 'post',
  path: '/practice/details',
  scope: 'legal:practice',
  actorPolicy: 'human',
  rateFamily: 'practice',
  rolloutGroup: 'practice-mutation',
  requestReferencePolicy: 'none',
};

const CONNECT_ACCOUNTS: KrabiClawFacadeRouteDefinition = {
  method: 'post',
  path: '/connect/connected-accounts',
  scope: 'legal:connect',
  actorPolicy: 'human',
  rateFamily: 'connect',
  rolloutGroup: 'connect',
  requestReferencePolicy: 'none',
};

const INTAKE_STATUS: KrabiClawFacadeRouteDefinition = {
  method: 'get',
  path: '/intakes/:id/status',
  scope: 'legal:intakes',
  actorPolicy: 'human-or-anonymous',
  rateFamily: 'intake',
  rolloutGroup: 'intake-without-payment',
  requestReferencePolicy: 'optional',
};

const ENGAGEMENT_ACCEPT: KrabiClawFacadeRouteDefinition = {
  method: 'patch',
  path: '/engagement-contracts/:id/status',
  scope: 'legal:engagements',
  actorPolicy: 'human',
  rateFamily: 'engagement',
  rolloutGroup: 'engagement',
  requestReferencePolicy: 'none',
  acceptsOriginatingClientIp: true,
};

const buildApp = () => {
  const app = new Hono<AppContext>();
  const respond = (c: Context<AppContext>) => c.json({ context: c.get('krabiclawFacadeRequestContext') ?? null });
  app.get('/practice/details', createKrabiClawFacadeRouteMiddleware(PRACTICE_DETAILS), respond);
  app.post('/practice/details', createKrabiClawFacadeRouteMiddleware(PRACTICE_DETAILS_MUTATION), respond);
  app.post('/connect/connected-accounts', createKrabiClawFacadeRouteMiddleware(CONNECT_ACCOUNTS), respond);
  app.get('/intakes/:id/status', createKrabiClawFacadeRouteMiddleware(INTAKE_STATUS), respond);
  app.patch('/engagement-contracts/:id/status', createKrabiClawFacadeRouteMiddleware(ENGAGEMENT_ACCEPT), respond);
  return app;
};

const humanHeaders = (scope: string) => ({
  authorization: `Bearer ${scope}`,
  'x-krabiclaw-organization-id': 'ext-org-1',
  'x-krabiclaw-actor-id': 'ext-user-1',
  'x-krabiclaw-actor-kind': 'human',
});

const anonymousHeaders = (scope: string, organizationId = 'ext-org-1') => ({
  authorization: `Bearer ${scope}`,
  'x-krabiclaw-organization-id': organizationId,
  'x-krabiclaw-actor-kind': 'anonymous',
});

describe('createKrabiClawFacadeRouteMiddleware', () => {
  it('reaches identity resolution for a correct fixed-client token with the exact family scope (gate order happy path)', async () => {
    const res = await buildApp().request('/practice/details', { headers: humanHeaders('legal:practice') });
    expect(res.status).toBe(200);
    expect(krabiclawIdentityResolverService.resolveIdentity).toHaveBeenCalled();
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ actor_kind: 'human', resolved_user_id: 'local-user-1' }),
      expect.objectContaining({ actorId: 'local-user-1', organizationId: 'local-org-1' })
    );
    // SAFETY: the fixture handler always responds with `{ context: c.get('krabiclawFacadeRequestContext') }`.
    const body = (await res.json()) as { context: { legalOperationContext: unknown } };
    expect(body.context.legalOperationContext).toEqual({ organizationId: 'local-org-1', userId: 'local-user-1' });
  });

  it('rejects a valid token carrying a different legal scope before the mocked D1 adapter runs (AE1)', async () => {
    vi.mocked(krabiclawDirectoryService.getOrganizationDirectoryRecord).mockClear();

    const res = await buildApp().request('/practice/details', { headers: humanHeaders('legal:connect') });

    expect(res.status).toBe(403);
    expect(krabiclawDirectoryService.getOrganizationDirectoryRecord).not.toHaveBeenCalled();
  });

  it('rejects a mutation while practice-read stays enabled, before D1 — practice-read and practice-mutation gate independently (AE8)', async () => {
    configState.rolloutGroups['practice-mutation'] = false;
    vi.mocked(krabiclawDirectoryService.getOrganizationDirectoryRecord).mockClear();

    try {
      const readRes = await buildApp().request('/practice/details', { headers: humanHeaders('legal:practice') });
      expect(readRes.status).toBe(200);

      vi.mocked(krabiclawDirectoryService.getOrganizationDirectoryRecord).mockClear();
      const mutationRes = await buildApp().request('/practice/details', {
        method: 'POST',
        headers: humanHeaders('legal:practice'),
      });
      expect(mutationRes.status).toBe(403);
      expect(krabiclawDirectoryService.getOrganizationDirectoryRecord).not.toHaveBeenCalled();
    } finally {
      configState.rolloutGroups['practice-mutation'] = true;
    }
  });

  it('rejects every route when its own rollout group is off, before D1', async () => {
    configState.rolloutGroups.connect = false;
    vi.mocked(krabiclawDirectoryService.getOrganizationDirectoryRecord).mockClear();

    try {
      const res = await buildApp().request('/connect/connected-accounts', {
        method: 'POST',
        headers: humanHeaders('legal:connect'),
      });
      expect(res.status).toBe(403);
      expect(krabiclawDirectoryService.getOrganizationDirectoryRecord).not.toHaveBeenCalled();
    } finally {
      configState.rolloutGroups.connect = true;
    }
  });

  it('rejects an unregistered path/method without invoking the token verifier or any dependency', async () => {
    const app = buildApp();
    vi.mocked(krabiclawDirectoryService.getOrganizationDirectoryRecord).mockClear();
    vi.mocked(krabiclawIdentityResolverService.resolveIdentity).mockClear();

    const res = await app.request('/practice/details', { method: 'DELETE', headers: humanHeaders('legal:practice') });

    expect(res.status).toBe(404);
    expect(krabiclawDirectoryService.getOrganizationDirectoryRecord).not.toHaveBeenCalled();
    expect(krabiclawIdentityResolverService.resolveIdentity).not.toHaveBeenCalled();
  });

  it.each(['/practice/details/', '//practice/details', '/Practice/Details'])(
    'never selects the registered route policy for a path variant Hono does not match exactly: %s',
    async (path) => {
      const res = await buildApp().request(path, { headers: humanHeaders('legal:practice') });
      expect(res.status).toBe(404);
    }
  );

  it('rejects an anonymous actor on a human-only route', async () => {
    const res = await buildApp().request('/practice/details', { headers: anonymousHeaders('legal:practice') });
    expect(res.status).toBe(403);
  });

  it('accepts a human actor on a human-or-anonymous route', async () => {
    const res = await buildApp().request('/intakes/abc/status', { headers: humanHeaders('legal:intakes') });
    expect(res.status).toBe(200);
  });

  it('accepts an anonymous actor on a human-or-anonymous route and retains a null external actor ID without a D1 user lookup (R20)', async () => {
    vi.mocked(krabiclawDirectoryService.getUserDirectoryRecord).mockClear();

    const res = await buildApp().request('/intakes/abc/status', { headers: anonymousHeaders('legal:intakes') });

    expect(res.status).toBe(200);
    expect(krabiclawDirectoryService.getUserDirectoryRecord).not.toHaveBeenCalled();
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ actor_kind: 'anonymous', external_actor_id: null, resolved_user_id: null }),
      expect.anything()
    );
    // SAFETY: the fixture handler always responds with `{ context: c.get('krabiclawFacadeRequestContext') }`.
    const body = (await res.json()) as { context: { externalActorId: string | null; userDirectory: unknown } };
    expect(body.context.externalActorId).toBeNull();
    expect(body.context.userDirectory).toBeNull();
  });

  it('fails closed on malformed trusted headers (duplicate organization id) once the token is already verified', async () => {
    const res = await buildApp().request('/practice/details', {
      headers: {
        ...humanHeaders('legal:practice'),
        'x-krabiclaw-organization-id': 'ext-org-1, ext-org-2',
      },
    });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid/expired machine token with a 401 the route never reaches', async () => {
    const res = await buildApp().request('/practice/details', { headers: humanHeaders('invalid') });
    expect(res.status).toBe(401);
  });

  it("does not let family A rate-limit traffic exhaust family B's organization bucket", async () => {
    rateLimitState.blockedKeys.clear();
    rateLimitState.blockedKeys.add('krabiclaw-facade:org:practice:org:ext-org-1');

    try {
      const practiceRes = await buildApp().request('/practice/details', { headers: humanHeaders('legal:practice') });
      const connectRes = await buildApp().request('/connect/connected-accounts', {
        method: 'POST',
        headers: humanHeaders('legal:connect'),
      });

      expect(practiceRes.status).toBe(429);
      expect(connectRes.status).toBe(200);
    } finally {
      rateLimitState.blockedKeys.clear();
    }
  });

  it('does not let a rotated claimed organization id bypass the fixed-client/family ceiling', async () => {
    rateLimitState.blockedKeys.clear();
    rateLimitState.blockedKeys.add('krabiclaw-facade:client:practice:client:fixed-client');

    try {
      const firstOrgRes = await buildApp().request('/practice/details', {
        headers: { ...humanHeaders('legal:practice'), 'x-krabiclaw-organization-id': 'ext-org-a' },
      });
      const secondOrgRes = await buildApp().request('/practice/details', {
        headers: { ...humanHeaders('legal:practice'), 'x-krabiclaw-organization-id': 'ext-org-b' },
      });

      expect(firstOrgRes.status).toBe(429);
      expect(secondOrgRes.status).toBe(429);
    } finally {
      rateLimitState.blockedKeys.clear();
    }
  });

  it('checks the client-family ceiling before the organization-family bucket', async () => {
    rateLimitState.blockedKeys.clear();
    rateLimitState.blockedKeys.add('krabiclaw-facade:client:practice:client:fixed-client');
    rateLimitState.blockedKeys.add('krabiclaw-facade:org:practice:org:ext-org-1');
    vi.mocked(krabiclawDirectoryService.getOrganizationDirectoryRecord).mockClear();

    try {
      const res = await buildApp().request('/practice/details', { headers: humanHeaders('legal:practice') });
      expect(res.status).toBe(429);
      expect(krabiclawDirectoryService.getOrganizationDirectoryRecord).not.toHaveBeenCalled();
    } finally {
      rateLimitState.blockedKeys.clear();
    }
  });

  it('rejects the originating-client-IP header outside the one route that accepts it (R27)', async () => {
    const res = await buildApp().request('/practice/details', {
      headers: { ...humanHeaders('legal:practice'), 'x-krabiclaw-originating-client-ip': '203.0.113.7' },
    });
    expect(res.status).toBe(400);
  });

  it('accepts the originating-client-IP header on the engagement route that declares it', async () => {
    const res = await buildApp().request('/engagement-contracts/contract-1/status', {
      method: 'PATCH',
      headers: { ...humanHeaders('legal:engagements'), 'x-krabiclaw-originating-client-ip': '203.0.113.7' },
    });
    expect(res.status).toBe(200);
    // SAFETY: the fixture handler always responds with `{ context: c.get('krabiclawFacadeRequestContext') }`.
    const body = (await res.json()) as { context: { trustedOriginatingClientIp: string | null } };
    expect(body.context.trustedOriginatingClientIp).toBe('203.0.113.7');
  });

  it('rejects a request-reference header on a route whose policy is "none"', async () => {
    const res = await buildApp().request('/practice/details', {
      headers: {
        ...humanHeaders('legal:practice'),
        'x-krabiclaw-request-reference': '11111111-1111-4111-8111-111111111111',
      },
    });
    expect(res.status).toBe(400);
  });

  it('propagates an HTTPException status for every rejection', async () => {
    const res = await buildApp().request('/practice/details', { headers: humanHeaders('invalid') });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('KrabiClawMachineAuthError', () => {
  it('is an HTTPException with status 401', async () => {
    const { KrabiClawMachineAuthError } = await import('@/modules/krabiclaw-integration/errors/facade-errors');
    const error = new KrabiClawMachineAuthError();
    expect(error).toBeInstanceOf(HTTPException);
    expect(error.status).toBe(401);
  });
});
