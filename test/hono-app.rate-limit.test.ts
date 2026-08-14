import type { Context, MiddlewareHandler } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { mountPath as krabiclawFacadeMountPath } from '@/modules/krabiclaw-integration/http';
import type { AppContext } from '@/shared/types/hono';

interface FakeRateLimitOptions {
  routeKey?: string;
  scope?: (c: Context<AppContext>) => string | null | undefined | Promise<string | null | undefined>;
}

const outerLimiterCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock('@/shared/middleware/rateLimit', () => ({
  rateLimit:
    (options?: FakeRateLimitOptions): MiddlewareHandler<AppContext> =>
    async (c, next) => {
      // Repo-wide, the outer app-wide limiter in src/hono-app.ts is the only rateLimit(...) caller that omits `routeKey`. The krabiclaw facade's own limiter always sets `routeKey: 'krabiclaw-facade'`, so this distinguishes the two without depending on request-time state.
      if (options?.routeKey === undefined) {
        outerLimiterCalls.count += 1;
      }
      return next();
    },
  rateLimiter: { getApiRateLimitIdentifier: () => 'anon:global', initialize: async () => undefined },
}));

const { app } = await import('@/test/helpers/app');

describe('outer API rate limiter', () => {
  it('does not run for requests under the krabiclaw facade mount path', async () => {
    outerLimiterCalls.count = 0;

    await app.request(`${krabiclawFacadeMountPath}/anything`, {
      headers: { authorization: 'Bearer token' },
    });

    expect(outerLimiterCalls.count).toBe(0);
  });

  it('still runs for other /api/* requests', async () => {
    outerLimiterCalls.count = 0;

    await app.request('/api/some-unmatched-path');

    expect(outerLimiterCalls.count).toBe(1);
  });
});
