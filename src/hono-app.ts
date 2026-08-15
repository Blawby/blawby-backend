import { bootApplication } from '@/boot';
import { mountPath as krabiclawFacadeMountPath } from '@/modules/krabiclaw-integration/http';
import { mcpHttp } from '@/modules/mcp';
import e2eFixturesHttp from '@/routes/e2e-fixtures';
import { registerAuthRoutes } from '@/shared/auth/better-auth.http';
import { config } from '@/shared/config';
import { cors, errorHandler, notFoundHandler, responseMiddleware } from '@/shared/middleware';
import { rateLimit, rateLimiter } from '@/shared/middleware/rateLimit';
import { registerModuleRoutes } from '@/shared/router/module-router';
import { buildOpenApiDocument, createOpenApiApp } from '@/shared/router/openapi-router';
import type { AppContext } from '@/shared/types/hono';
import { uploadsHttp } from '@/shared/uploads/http';
import { createMarkdownFromOpenApi } from '@/shared/utils/openapi';
import { honoLogger } from '@logtape/hono';
import { Scalar } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
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
  })
);
app.use('*', cors());
app.use('*', responseMiddleware());
// The KrabiClaw facade has no Better Auth user or API key, so the outer rate limiter would bucket every organization under the same `anon:global` key, defeating the facade's own organization-scoped limiter. It gets an IP-scoped backstop here instead — covering requests with a missing or invalid token, before krabiclawFacadeAuthMiddleware can even run — and its own organization-scoped limiter applies afterward, inside the module's own HTTP flow, once the caller is authenticated.
const apiRateLimit = rateLimit({ scope: rateLimiter.getApiRateLimitIdentifier });
const krabiclawFacadePreAuthRateLimit = rateLimit({ routeKey: 'krabiclaw-facade-preauth', scope: 'ip' });
const isKrabiclawFacadePath = (path: string): boolean =>
  path === krabiclawFacadeMountPath || path.startsWith(`${krabiclawFacadeMountPath}/`);
app.use('/api/*', async (c, next) => {
  if (isKrabiclawFacadePath(c.req.path)) {
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
