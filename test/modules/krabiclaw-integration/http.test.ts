import { describe, expect, it, vi } from 'vitest';

import krabiclawIntegrationApp, { mountPath } from '@/modules/krabiclaw-integration/http';

const configState = vi.hoisted(() => ({ facadeEnabled: false }));

vi.mock('@/shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/config')>();
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
});
