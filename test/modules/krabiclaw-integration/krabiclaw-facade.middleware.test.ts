import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it, vi } from 'vitest';

import {
  krabiclawFacadeAuthMiddleware,
  krabiclawFacadeIdentityMiddleware,
} from '@/modules/krabiclaw-integration/middleware/krabiclaw-facade.middleware';
import { krabiclawDirectoryService } from '@/modules/krabiclaw-integration/services/krabiclaw-directory.service';
import { krabiclawIdentityResolverService } from '@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service';
import type { config } from '@/shared/config';

const configState = vi.hoisted(() => ({ facadeEnabled: true, oauthClientId: 'fixed-client' }));

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
      },
    },
  };
});

const VALID_TOKEN = 'token';

vi.mock('@/modules/krabiclaw-integration/middleware/verify-facade-token', () => ({
  verifyFacadeToken: vi.fn(async (token: string | undefined) => {
    if (token !== VALID_TOKEN) {
      throw new HTTPException(401, { message: 'Invalid access token' });
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

const buildApp = () => {
  const app = new Hono();
  app.use('*', krabiclawFacadeAuthMiddleware(), krabiclawFacadeIdentityMiddleware());
  app.get('/', (c) => c.json({ context: c.get('legalOperationContext') ?? null }));
  return app;
};

const humanHeaders = {
  authorization: 'Bearer token',
  'x-krabiclaw-organization-id': 'ext-org-1',
  'x-krabiclaw-actor-id': 'ext-user-1',
  'x-krabiclaw-actor-kind': 'human',
};

describe('krabiclawFacadeAuthMiddleware + krabiclawFacadeIdentityMiddleware', () => {
  it('returns 404 when the facade kill switch is off', async () => {
    configState.facadeEnabled = false;
    const res = await buildApp().request('/', { headers: humanHeaders });
    expect(res.status).toBe(404);
    configState.facadeEnabled = true;
  });

  it('sets an auth-independent LegalOperationContext for a human actor', async () => {
    const res = await buildApp().request('/', { headers: humanHeaders });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ context: { organizationId: 'local-org-1', userId: 'local-user-1' } });
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ actor_kind: 'human', resolved_user_id: 'local-user-1' }),
      expect.objectContaining({ actorId: 'local-user-1', organizationId: 'local-org-1' })
    );
  });

  it('sets a null userId for an anonymous actor and never asks the directory for a user record', async () => {
    vi.mocked(krabiclawDirectoryService.getUserDirectoryRecord).mockClear();

    const res = await buildApp().request('/', {
      headers: {
        authorization: 'Bearer token',
        'x-krabiclaw-organization-id': 'ext-org-1',
        'x-krabiclaw-actor-kind': 'anonymous',
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ context: { organizationId: 'local-org-1', userId: null } });
    expect(krabiclawDirectoryService.getUserDirectoryRecord).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid token even when the identity headers are also malformed', async () => {
    const res = await buildApp().request('/', { headers: { authorization: 'Bearer not-the-valid-token' } });
    expect(res.status).toBe(401);
  });

  it('rejects malformed headers once the token has already been verified', async () => {
    const res = await buildApp().request('/', { headers: { authorization: `Bearer ${VALID_TOKEN}` } });
    expect(res.status).toBe(400);
  });

  it('never sets legalOperationContext on a route outside the facade middleware', async () => {
    const plainApp = new Hono();
    plainApp.get('/', (c) => c.json({ context: c.get('legalOperationContext') ?? null }));
    const res = await plainApp.request('/');
    expect(await res.json()).toEqual({ context: null });
  });

  it('passes actor kind through to the identity resolver rather than re-deriving it', async () => {
    vi.mocked(krabiclawIdentityResolverService.resolveIdentity).mockResolvedValueOnce({
      organizationId: 'local-org-2',
      userId: null,
    });
    const res = await buildApp().request('/', { headers: humanHeaders });
    expect(await res.json()).toEqual({ context: { organizationId: 'local-org-2', userId: null } });
  });

  it('never calls the directory, identity resolver, or audit dispatch when the auth middleware alone fails', async () => {
    vi.mocked(krabiclawDirectoryService.getOrganizationDirectoryRecord).mockClear();
    vi.mocked(krabiclawIdentityResolverService.resolveIdentity).mockClear();
    dispatchMock.mockClear();

    const app = new Hono();
    app.use('*', krabiclawFacadeAuthMiddleware());
    app.get('/', (c) => c.json({ context: c.get('legalOperationContext') ?? null }));

    const res = await app.request('/', { headers: { authorization: 'Bearer not-the-valid-token' } });

    expect(res.status).toBe(401);
    expect(krabiclawDirectoryService.getOrganizationDirectoryRecord).not.toHaveBeenCalled();
    expect(krabiclawIdentityResolverService.resolveIdentity).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });
});
