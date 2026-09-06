import type { Context, MiddlewareHandler } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { mountPath as krabiclawFacadeMountPath } from '@/modules/krabiclaw-integration/http';
import type { config as realConfig } from '@/shared/config';
import type { AppContext } from '@/shared/types/hono';

interface FakeRateLimitOptions {
  routeKey?: string;
  scope?: (c: Context<AppContext>) => string | null | undefined | Promise<string | null | undefined>;
}

const OUTER_KEY = 'outer';

const limiterCalls = vi.hoisted(() => ({ counts: new Map<string, number>() }));
// `.env.test` leaves `KRABICLAW_FACADE_ENABLED` unset, so the real config's default is `false` — mirrored here so the mock's default matches production's default-off state without duplicating it.
const facadeState = vi.hoisted(() => ({ enabled: false }));

const recordCall = (key: string): void => {
  limiterCalls.counts.set(key, (limiterCalls.counts.get(key) ?? 0) + 1);
};

vi.mock('@/shared/middleware/rateLimit', () => ({
  rateLimit:
    (options?: FakeRateLimitOptions): MiddlewareHandler<AppContext> =>
    async (c, next) => {
      // The outer app-wide limiter in src/hono-app.ts is the only rateLimit(...) caller that omits `routeKey`.
      recordCall(options?.routeKey ?? OUTER_KEY);
      return next();
    },
  rateLimiter: { getApiRateLimitIdentifier: () => 'anon:global', initialize: async () => undefined },
}));

vi.mock('@/shared/config', async (importOriginal) => {
  const actual = await importOriginal<{ config: typeof realConfig }>();
  return {
    config: {
      ...actual.config,
      krabiclaw: {
        ...actual.config.krabiclaw,
        get facadeEnabled() {
          return facadeState.enabled;
        },
      },
    },
  };
});

const { app } = await import('@/test/helpers/app');

describe('krabiclaw facade rate-limit wiring in the root app', () => {
  /**
   * `KRABICLAW_FACADE_ENABLED` is unset in `.env.test`, so `config.krabiclaw.facadeEnabled` is
   * `false` here — the same default-off state production starts in (R17, AE5). The kill switch
   * must be the cheapest, first-checked gate for a facade request: neither rate limiter may run
   * (and so neither may spend or be poisoned by) rate-limit I/O for a route that will 404 anyway.
   */
  it('runs neither rate limiter while the facade is disabled (the default-off kill switch), for a request with no token', async () => {
    limiterCalls.counts.clear();

    await app.request(`${krabiclawFacadeMountPath}/anything`);

    expect(limiterCalls.counts.get('krabiclaw-facade-preauth')).toBeUndefined();
    expect(limiterCalls.counts.get(OUTER_KEY)).toBeUndefined();
  });

  it('runs neither rate limiter while the facade is disabled, for a request with an invalid token', async () => {
    limiterCalls.counts.clear();

    await app.request(`${krabiclawFacadeMountPath}/anything`, {
      headers: { authorization: 'Bearer not-a-real-token' },
    });

    expect(limiterCalls.counts.get('krabiclaw-facade-preauth')).toBeUndefined();
    expect(limiterCalls.counts.get(OUTER_KEY)).toBeUndefined();
  });

  it('runs the IP-scoped pre-auth limiter once the facade is enabled', async () => {
    limiterCalls.counts.clear();
    facadeState.enabled = true;
    try {
      await app.request(`${krabiclawFacadeMountPath}/anything`);

      expect(limiterCalls.counts.get('krabiclaw-facade-preauth')).toBe(1);
      expect(limiterCalls.counts.get(OUTER_KEY)).toBeUndefined();
    } finally {
      facadeState.enabled = false;
    }
  });

  it('still runs the outer limiter for other /api/* requests', async () => {
    limiterCalls.counts.clear();

    await app.request('/api/some-unmatched-path');

    expect(limiterCalls.counts.get(OUTER_KEY)).toBe(1);
    expect(limiterCalls.counts.get('krabiclaw-facade-preauth')).toBeUndefined();
  });

  it('does not treat a merely prefix-similar path as part of the facade mount', async () => {
    limiterCalls.counts.clear();

    await app.request(`${krabiclawFacadeMountPath}evil`);

    expect(limiterCalls.counts.get(OUTER_KEY)).toBe(1);
    expect(limiterCalls.counts.get('krabiclaw-facade-preauth')).toBeUndefined();
  });
});
