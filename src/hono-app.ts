import { bootApplication } from '@/boot';
import { mcpHttp } from '@/modules/mcp';
import e2eFixturesHttp from '@/routes/e2e-fixtures';
import { registerAuthRoutes } from '@/shared/auth/better-auth.http';
import { config } from '@/shared/config';
import { cors, errorHandler, notFoundHandler, responseMiddleware } from '@/shared/middleware';
import { isKrabiclawFacadeRequest } from '@/shared/middleware/isKrabiclawFacadeRequest';
import { rateLimit, rateLimiter } from '@/shared/middleware/rateLimit';
import { registerModuleRoutes } from '@/shared/router/module-router';
import { buildOpenApiDocument, createOpenApiApp } from '@/shared/router/openapi-router';
import type { AppContext } from '@/shared/types/hono';
import { uploadsHttp } from '@/shared/uploads/http';
import { createMarkdownFromOpenApi } from '@/shared/utils/openapi';
import { honoLogger } from '@logtape/hono';
import { Scalar } from '@scalar/hono-api-reference';
import { Hono, type Context } from 'hono';
import { requestId } from 'hono/request-id';
import { routePath } from 'hono/route';
import { RegExpRouter } from 'hono/router/reg-exp-router';
import { SmartRouter } from 'hono/router/smart-router';
import { TrieRouter } from 'hono/router/trie-router';

const app = new Hono<AppContext>({
  router: new SmartRouter({
    routers: [new RegExpRouter(), new TrieRouter()],
  }),
});

// Middlewares – order is important!
app.use('*', requestId());
app.use(
  '*',
  honoLogger({
    skip: (c) => c.req.path === '/api/health',
    /**
     * `honoLogger`'s default `format: 'combined'` logs the full request `url` (with query string)
     * and `path` at info level for every request. Two facade routes carry R23-prohibited values in
     * exactly those fields: the anonymous intake follow-up request reference is a path segment on
     * `GET /intakes/requests/{request_id}`, and the Stripe Checkout session ID is a `session_id`
     * query parameter on `GET /intakes/{uuid}/post-pay/status`. For any request under the facade's
     * mount path, replace both fields with `routePath(c)` — the registered route pattern (e.g.
     * `/intakes/requests/:request_id`), not the matched value — the same sanitization the facade's
     * own audit logger already applies (see `middleware/krabiclaw-facade.middleware.ts`). Every
     * other field mirrors the built-in `combined` format exactly.
     */
    format: (c, responseTime) => {
      const isFacadeRequest = isKrabiclawFacadeRequest(c.req.path);
      /**
       * SAFETY: `@logtape/hono`'s `FormatFunction` type declares only the minimal `HonoContext`
       * surface, but the library always invokes `format` with the real Hono `Context` it received
       * from `createMiddleware` (see `@logtape/hono/dist/mod.js`: the same `c` passed to the
       * middleware handler is forwarded unchanged to `formatFn(c, responseTime)`). `Context` is
       * structurally assignable to `HonoContext`, so this narrows back to the real runtime type in
       * one step to call `routePath`, which needs the full `Context`.
       */
      const sanitizedPath = isFacadeRequest ? routePath(c as Context) : c.req.path;
      return {
        method: c.req.method,
        // Non-facade requests keep the full URL (with query string), matching the built-in
        // `combined` format exactly; only facade requests are replaced with the route pattern.
        url: isFacadeRequest ? sanitizedPath : c.req.url,
        path: sanitizedPath,
        status: c.res.status,
        responseTime,
        contentLength: c.res.headers.get('content-length') ?? undefined,
        userAgent: c.req.header('user-agent'),
        /**
         * A referring URL's own query string could carry a request reference or Checkout session
         * ID if the caller's frontend passed one through unstripped — unlike `url`/`path` above,
         * there's no facade-safe substitute (like `routePath(c)`) for an arbitrary referrer, so
         * facade requests omit it entirely rather than logging it raw.
         * `||`, not `??`, to match the built-in `combined` format's fallback exactly for non-facade
         * requests — an empty-string `referrer` header must still fall through to `referer`.
         */
        // oxlint-disable-next-line typescript/prefer-nullish-coalescing
        referrer: isFacadeRequest ? undefined : c.req.header('referrer') || c.req.header('referer'),
      };
    },
  })
);
app.use('*', cors());
app.use('*', responseMiddleware());
// The KrabiClaw facade has no Better Auth user or API key, so the outer rate limiter would bucket every organization under the same `anon:global` key, defeating the facade's own organization-scoped limiter. It gets an IP-scoped backstop here instead — covering requests with a missing or invalid token, before krabiclawFacadeAuthMiddleware can even run — and its own organization-scoped limiter applies afterward, inside the module's own HTTP flow, once the caller is authenticated.
const apiRateLimit = rateLimit({ scope: rateLimiter.getApiRateLimitIdentifier });
const krabiclawFacadePreAuthRateLimit = rateLimit({ routeKey: 'krabiclaw-facade-preauth', scope: 'ip' });
app.use('/api/*', async (c, next) => {
  if (isKrabiclawFacadeRequest(c.req.path)) {
    return krabiclawFacadePreAuthRateLimit(c, next);
  }
  return apiRateLimit(c, next);
});

registerAuthRoutes(app);

// Register additional module routes
await registerModuleRoutes(app);

// Shared upload infrastructure endpoints
app.route('/api/uploads', uploadsHttp);

// MCP server — Bearer token auth handled inside mcpHttp
app.route('/mcp', mcpHttp);

if (config.e2e.fixturesEnabled && config.env.isStaging && !config.env.isProduction) {
  app.route('/api/e2e', e2eFixturesHttp);
}

const openApiApp = createOpenApiApp();

app.get('/doc', (c) => c.json(buildOpenApiDocument(openApiApp)));

app.get('/llms.txt', async (c) => {
  const markdown = await createMarkdownFromOpenApi(buildOpenApiDocument(openApiApp));
  return c.text(markdown);
});

// Scalar API documentation UI - fetches OpenAPI spec from /doc endpoint
// oxlint-disable-next-line new-cap -- Scalar is a factory function, not a constructor
app.get('/scalar', Scalar({ url: '/doc' }));

// Boot application (wait for all services to be ready)
await bootApplication();

// Not found and error handlers
app.notFound(notFoundHandler);
app.onError(errorHandler);

export default app;
