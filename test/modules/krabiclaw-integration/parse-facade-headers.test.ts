import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';

import { parseFacadeHeaders } from '@/modules/krabiclaw-integration/middleware/parse-facade-headers';

const contextFromHeaders = async (headers: Record<string, string>) => {
  let captured: unknown = undefined;
  const app = new Hono();
  app.get('/', (c) => {
    captured = parseFacadeHeaders(c);
    return c.text('ok');
  });
  const res = await app.request('/', { headers });
  return { res, captured };
};

describe('parseFacadeHeaders', () => {
  it('parses a valid human actor request', async () => {
    const { res, captured } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-id': 'ext-user-1',
      'x-krabiclaw-actor-kind': 'human',
    });
    expect(res.status).toBe(200);
    expect(captured).toEqual({
      externalOrganizationId: 'ext-org-1',
      externalActorId: 'ext-user-1',
      actorKind: 'human',
    });
  });

  it('parses a valid anonymous actor request with no actor id', async () => {
    const { captured } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-kind': 'anonymous',
    });
    expect(captured).toEqual({ externalOrganizationId: 'ext-org-1', externalActorId: null, actorKind: 'anonymous' });
  });

  it('rejects a missing organization id', async () => {
    const { res } = await contextFromHeaders({ 'x-krabiclaw-actor-kind': 'anonymous' });
    expect(res.status).toBe(400);
  });

  it('rejects an unrecognized actor kind', async () => {
    const { res } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-kind': 'staff',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a human actor kind with no actor id', async () => {
    const { res } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-kind': 'human',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an anonymous actor kind that also sends an actor id', async () => {
    const { res } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-id': 'ext-user-1',
      'x-krabiclaw-actor-kind': 'anonymous',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicated organization id header (arrives comma-joined)', async () => {
    const { res } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1, ext-org-2',
      'x-krabiclaw-actor-kind': 'anonymous',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a present but empty actor-id header on an anonymous request', async () => {
    const { res } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-id': '',
      'x-krabiclaw-actor-kind': 'anonymous',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a whitespace-only actor-id header on a human request', async () => {
    const { res } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-id': '   ',
      'x-krabiclaw-actor-kind': 'human',
    });
    expect(res.status).toBe(400);
  });

  it('propagates HTTPException with a 400 status', async () => {
    const app = new Hono();
    app.get('/', (c) => {
      try {
        parseFacadeHeaders(c);
        return c.text('ok');
      } catch (error) {
        if (!(error instanceof HTTPException)) {
          throw error;
        }
        expect(error.status).toBe(400);
        throw error;
      }
    });
    const res = await app.request('/', { headers: {} });
    expect(res.status).toBe(400);
  });
});
