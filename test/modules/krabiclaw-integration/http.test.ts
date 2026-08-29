import { z } from '@hono/zod-openapi';
import { describe, expect, it, vi } from 'vitest';

import krabiclawIntegrationApp, { mountPath } from '@/modules/krabiclaw-integration/http';
import { createKrabiClawFacadeRouteMiddleware } from '@/modules/krabiclaw-integration/middleware/krabiclaw-facade.middleware';
import { verifyFacadeToken } from '@/modules/krabiclaw-integration/middleware/verify-facade-token';
import { krabiclawDirectoryService } from '@/modules/krabiclaw-integration/services/krabiclaw-directory.service';
import { krabiclawIdentityResolverService } from '@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service';
import type { KrabiClawFacadeRouteDefinition } from '@/modules/krabiclaw-integration/types/route-policy.types';
import { routeBuilder } from '@/shared/router/route-builder';
import type { config } from '@/shared/config';

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

  describe('a route registered against the policy layer (the U3/U4/U5 integration pattern)', () => {
    const definition: KrabiClawFacadeRouteDefinition = {
      method: 'get',
      path: '/practice/details',
      scope: 'legal:practice',
      actorPolicy: 'human',
      rateFamily: 'practice',
      rolloutGroup: 'practice-read',
      requestReferencePolicy: 'none',
    };

    krabiclawIntegrationApp.openapi(
      routeBuilder.build({
        method: 'get',
        path: '/practice/details',
        middleware: [createKrabiClawFacadeRouteMiddleware(definition)],
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } },
          },
        },
      }),
      (c) => c.json({ ok: true })
    );

    it('reaches the handler once every policy gate passes, and the response still carries Cache-Control: no-store', async () => {
      configState.facadeEnabled = true;
      try {
        const res = await krabiclawIntegrationApp.request('/practice/details', {
          headers: {
            authorization: `Bearer ${VALID_TOKEN}`,
            'x-krabiclaw-organization-id': 'ext-org-1',
            'x-krabiclaw-actor-id': 'ext-user-1',
            'x-krabiclaw-actor-kind': 'human',
          },
        });
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
        const res = await krabiclawIntegrationApp.request('/practice/details', {
          headers: anonymousHeaders('ext-org-1'),
        });
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
        const res = await krabiclawIntegrationApp.request('/practice/details', {
          headers: { authorization: 'Bearer not-the-valid-token' },
        });
        expect(res.status).toBe(401);
        expect(res.headers.get('WWW-Authenticate')).toBe('Bearer realm="krabiclaw-facade", error="invalid_token"');
        expect(await res.json()).toMatchObject({ error: { code: 'invalid_token' } });
      } finally {
        configState.facadeEnabled = false;
      }
    });
  });
});
