import { honoLogger } from '@logtape/hono';
import { Scalar } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { RegExpRouter } from 'hono/router/reg-exp-router';
import { SmartRouter } from 'hono/router/smart-router';
import { TrieRouter } from 'hono/router/trie-router';
import { bootApplication } from '@/boot';
import { registerAuthRoutes } from '@/shared/auth/better-auth.http';
import { cors, responseMiddleware, notFoundHandler, errorHandler } from '@/shared/middleware';
import { rateLimit, rateLimiter } from '@/shared/middleware/rateLimit';
import { uploadsHttp } from '@/shared/uploads/http';
import { mcpHttp } from '@/modules/mcp';
import { registerModuleRoutes } from '@/shared/router/module-router';
import { createOpenApiApp, buildOpenApiDocument } from '@/shared/router/openapi-router';
import type { AppContext } from '@/shared/types/hono';
import { createMarkdownFromOpenApi } from '@/shared/utils/openapi';

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
app.use('/api/*', rateLimit({ scope: rateLimiter.getApiRateLimitIdentifier }));

registerAuthRoutes(app);

// Register additional module routes
await registerModuleRoutes(app);

// Shared upload infrastructure endpoints
app.route('/api/uploads', uploadsHttp);

// MCP server — Bearer token auth handled inside mcpHttp
app.route('/mcp', mcpHttp);

const openApiApp = createOpenApiApp();

app.get('/doc', (c) => c.json(buildOpenApiDocument(openApiApp)));

app.get('/llms.txt', async (c) => {
  const markdown = await createMarkdownFromOpenApi(buildOpenApiDocument(openApiApp));
  return c.text(markdown);
});

// Scalar API documentation UI - fetches OpenAPI spec from /doc endpoint
app.get('/scalar', Scalar({ url: '/doc' }));

// Boot application (wait for all services to be ready)
await bootApplication();

// Not found and error handlers
app.notFound(notFoundHandler);
app.onError(errorHandler);

export default app;
