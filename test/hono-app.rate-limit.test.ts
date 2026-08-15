import type { Context, MiddlewareHandler } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { mountPath as krabiclawFacadeMountPath } from '@/modules/krabiclaw-integration/http';
import type { AppContext } from '@/shared/types/hono';

interface FakeRateLimitOptions {
  routeKey?: string;
  scope?: (c: Context<AppContext>) => string | null | undefined | Promise<string | null | undefined>;
}

const OUTER_KEY = 'outer';

const limiterCalls = vi.hoisted(() => ({ counts: new Map<string, number>() }));

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

const { app } = await import('@/test/helpers/app');

describe('krabiclaw facade rate-limit wiring in the root app', () => {
  it('runs the IP-scoped pre-auth limiter, not the outer limiter, for a request with no token', async () => {
    limiterCalls.counts.clear();

    await app.request(`${krabiclawFacadeMountPath}/anything`);

    expect(limiterCalls.counts.get('krabiclaw-facade-preauth')).toBe(1);
    expect(limiterCalls.counts.get(OUTER_KEY)).toBeUndefined();
  });

  it('runs the IP-scoped pre-auth limiter, not the outer limiter, for a request with an invalid token', async () => {
    limiterCalls.counts.clear();

    await app.request(`${krabiclawFacadeMountPath}/anything`, {
      headers: { authorization: 'Bearer not-a-real-token' },
    });

    expect(limiterCalls.counts.get('krabiclaw-facade-preauth')).toBe(1);
    expect(limiterCalls.counts.get(OUTER_KEY)).toBeUndefined();
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
