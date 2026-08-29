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
      requestReference: null,
      trustedOriginatingClientIp: null,
    });
  });

  it('parses a valid anonymous actor request, retaining its actor id (R4)', async () => {
    const { captured } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-id': 'ext-anon-actor-1',
      'x-krabiclaw-actor-kind': 'anonymous',
    });
    expect(captured).toEqual({
      externalOrganizationId: 'ext-org-1',
      externalActorId: 'ext-anon-actor-1',
      actorKind: 'anonymous',
      requestReference: null,
      trustedOriginatingClientIp: null,
    });
  });

  it('parses a valid request reference and originating-client-IP header', async () => {
    const { captured } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-id': 'ext-anon-actor-1',
      'x-krabiclaw-actor-kind': 'anonymous',
      'x-krabiclaw-request-reference': '11111111-1111-4111-8111-111111111111',
      'x-krabiclaw-originating-client-ip': '203.0.113.7',
    });
    expect(captured).toEqual({
      externalOrganizationId: 'ext-org-1',
      externalActorId: 'ext-anon-actor-1',
      actorKind: 'anonymous',
      requestReference: '11111111-1111-4111-8111-111111111111',
      trustedOriginatingClientIp: '203.0.113.7',
    });
  });

  it('rejects a non-UUIDv4 request reference', async () => {
    const { res } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-id': 'ext-anon-actor-1',
      'x-krabiclaw-actor-kind': 'anonymous',
      'x-krabiclaw-request-reference': 'not-a-uuid',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a non-canonical originating-client-IP header (e.g. a forwarded-for list)', async () => {
    const { res } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-id': 'ext-anon-actor-1',
      'x-krabiclaw-actor-kind': 'anonymous',
      'x-krabiclaw-originating-client-ip': '203.0.113.7, 10.0.0.1',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an oversized organization id header', async () => {
    const { res } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'x'.repeat(65),
      'x-krabiclaw-actor-id': 'ext-anon-actor-1',
      'x-krabiclaw-actor-kind': 'anonymous',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an organization id header with a disallowed character', async () => {
    const { res } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1!',
      'x-krabiclaw-actor-id': 'ext-anon-actor-1',
      'x-krabiclaw-actor-kind': 'anonymous',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an oversized actor id header', async () => {
    const { res } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-id': 'x'.repeat(65),
      'x-krabiclaw-actor-kind': 'anonymous',
    });
    expect(res.status).toBe(400);
  });

  it('accepts a valid non-UUID bounded canonical-text external ID', async () => {
    const { res, captured } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'org_2p8qsF1s0LKzAxYzR9WvQ',
      'x-krabiclaw-actor-id': 'usr_9fVn2QxLp7aWzKcT4mHs',
      'x-krabiclaw-actor-kind': 'anonymous',
    });
    expect(res.status).toBe(200);
    expect(captured).toEqual({
      externalOrganizationId: 'org_2p8qsF1s0LKzAxYzR9WvQ',
      externalActorId: 'usr_9fVn2QxLp7aWzKcT4mHs',
      actorKind: 'anonymous',
      requestReference: null,
      trustedOriginatingClientIp: null,
    });
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

  it('rejects an anonymous actor kind with no actor id (R4 — required for both actor kinds)', async () => {
    const { res } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-kind': 'anonymous',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicated organization id header (arrives comma-joined)', async () => {
    const { res } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1, ext-org-2',
      'x-krabiclaw-actor-id': 'ext-anon-actor-1',
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
