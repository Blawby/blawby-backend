import type { Context, MiddlewareHandler } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import krabiclawIntegrationApp, { mountPath } from '@/modules/krabiclaw-integration/http';
import { verifyFacadeToken } from '@/modules/krabiclaw-integration/middleware/verify-facade-token';
import { krabiclawDirectoryService } from '@/modules/krabiclaw-integration/services/krabiclaw-directory.service';
import { krabiclawIdentityResolverService } from '@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service';
import type { config } from '@/shared/config';
import type { AppContext } from '@/shared/types/hono';

const configState = vi.hoisted(() => ({ facadeEnabled: false }));

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
      },
    },
  };
});

const VALID_TOKEN = 'token';

vi.mock('@/modules/krabiclaw-integration/middleware/verify-facade-token', () => ({
  verifyFacadeToken: vi.fn(async (token: string | undefined) => {
    if (token !== VALID_TOKEN) {
      throw new Error('unexpected token in http.test.ts');
    }
    return { clientId: 'fixed-client' };
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
    resolveIdentity: vi.fn(async () => ({ organizationId: 'local-org-1', userId: null })),
  },
}));

const dispatchMock = vi.hoisted(() => vi.fn(async () => 'event-id-1'));
vi.mock('@/shared/events/definitions/krabiclaw', () => ({
  KrabiClawActorAttributed: { dispatch: dispatchMock },
}));

const rateLimitState = vi.hoisted(() => ({ blockedScopes: new Set<string>() }));

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
      if (identifier && rateLimitState.blockedScopes.has(key)) {
        return c.json({ error: 'Too Many Requests', message: 'Too many requests.', retry_after: 1 }, 429);
      }
      return next();
    },
}));

const anonymousHeaders = (organizationId: string) => ({
  authorization: `Bearer ${VALID_TOKEN}`,
  'x-krabiclaw-organization-id': organizationId,
  'x-krabiclaw-actor-kind': 'anonymous',
});

describe('krabiclaw-integration http.ts', () => {
  it("exports the route scope table's base path as its mount path", () => {
    expect(mountPath).toBe('/api/integrations/krabiclaw/v1');
  });

  it('404s every path while the kill switch is off, proving no route is reachable yet', async () => {
    const res = await krabiclawIntegrationApp.request('/practice/details', {
      headers: {
        authorization: 'Bearer token',
        'x-krabiclaw-organization-id': 'ext-org-1',
        'x-krabiclaw-actor-kind': 'anonymous',
      },
    });
    expect(res.status).toBe(404);
  });

  it('never verifies the token when the kill switch is off', async () => {
    vi.mocked(verifyFacadeToken).mockClear();

    await krabiclawIntegrationApp.request('/practice/details', { headers: anonymousHeaders('ext-org-1') });

    expect(verifyFacadeToken).not.toHaveBeenCalled();
  });

  describe('with the facade enabled', () => {
    it('skips D1, PostgreSQL identity resolution, and attribution audit dispatch when the request is rate-limited', async () => {
      configState.facadeEnabled = true;
      rateLimitState.blockedScopes.clear();
      rateLimitState.blockedScopes.add('krabiclaw-facade:org:ext-org-rate-limited');
      vi.mocked(krabiclawDirectoryService.getOrganizationDirectoryRecord).mockClear();
      vi.mocked(krabiclawIdentityResolverService.resolveIdentity).mockClear();
      dispatchMock.mockClear();

      try {
        const res = await krabiclawIntegrationApp.request('/practice/details', {
          headers: anonymousHeaders('ext-org-rate-limited'),
        });

        expect(res.status).toBe(429);
        expect(krabiclawDirectoryService.getOrganizationDirectoryRecord).not.toHaveBeenCalled();
        expect(krabiclawIdentityResolverService.resolveIdentity).not.toHaveBeenCalled();
        expect(dispatchMock).not.toHaveBeenCalled();
      } finally {
        configState.facadeEnabled = false;
        rateLimitState.blockedScopes.clear();
      }
    });

    it('does not share rate-limit state across organization scopes', async () => {
      configState.facadeEnabled = true;
      rateLimitState.blockedScopes.clear();
      rateLimitState.blockedScopes.add('krabiclaw-facade:org:ext-org-blocked');

      try {
        const blockedRes = await krabiclawIntegrationApp.request('/practice/details', {
          headers: anonymousHeaders('ext-org-blocked'),
        });
        const allowedRes = await krabiclawIntegrationApp.request('/practice/details', {
          headers: anonymousHeaders('ext-org-allowed'),
        });

        expect(blockedRes.status).toBe(429);
        // Still no route registered (U8), so an allowed request 404s past the middleware chain instead of being rejected by the rate limiter.
        expect(allowedRes.status).toBe(404);
      } finally {
        configState.facadeEnabled = false;
        rateLimitState.blockedScopes.clear();
      }
    });
  });
});
