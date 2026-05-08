import { honoLogger } from '@logtape/hono';
import { Scalar } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { RegExpRouter } from 'hono/router/reg-exp-router';
import { SmartRouter } from 'hono/router/smart-router';
import { TrieRouter } from 'hono/router/trie-router';
import { bootApplication } from '@/boot';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';
import { db } from '@/shared/database';
import { cors, responseMiddleware, notFoundHandler, errorHandler } from '@/shared/middleware';
import { autoCreateOrgForSubscription } from '@/shared/middleware/autoCreateOrgForSubscription';
import { normalizeAuthResponse } from '@/shared/middleware/normalizeAuthResponse';
import { sanitizeAuthResponse } from '@/shared/middleware/sanitizeAuthResponse';
import { uploadsHttp } from '@/shared/uploads/http';
import { registerModuleRoutes } from '@/shared/router/module-router';
import { createOpenApiApp } from '@/shared/router/openapi-router';
import type { AppContext } from '@/shared/types/hono';
import { createMarkdownFromOpenApi } from '@/shared/utils/openapi';
import { config } from '@/shared/config';

// Automatically collect OpenAPI routes from all OpenAPIHono modules
// This iterates through the module registry and mounts any OpenAPIHono instances

const app = new Hono<AppContext>({
  router: new SmartRouter({
    routers: [new RegExpRouter(), new TrieRouter()],
  }),
});

// Lazy initialization - only create when needed (after env vars are loaded)
// Note: we may create per-redirectURI Better Auth instances when handling auth
// Requests so that the underlying library uses the correct Google redirect URI
// For the token exchange.

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

// Apply auth-specific middlewares only to auth routes
app.use('/api/auth/*', normalizeAuthResponse()); // Normalize Better Auth responses first
app.use('/api/auth/*', sanitizeAuthResponse()); // Then sanitize (remove token field)
app.use('/api/auth/*', autoCreateOrgForSubscription()); // Auto-create org for subscriptions

// Mount Better Auth handler
app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  const host = c.req.header('host');
  const redirectUri = betterAuthUtils.getGoogleRedirectUriForHost(host);
  const authInstance = createBetterAuthInstance(db, redirectUri);
  return authInstance.handler(c.req.raw);
});

// Register additional module routes
await registerModuleRoutes(app);

// Shared upload infrastructure endpoints
app.route('/api/uploads', uploadsHttp);

// Create OpenAPI app for documentation - collect routes from all OpenAPIHono modules
const openApiApp = createOpenApiApp();

const buildOpenApiDocument = () => {
  const baseUrl = config.app.baseUrl || `http://localhost:${config.server.port ?? 3000}`;
  const doc = openApiApp.getOpenAPIDocument({
    openapi: '3.0.0',
    info: {
      title: 'Blawby API',
      version: '1.0.0',
      description: 'API documentation for Blawby backend services',
    },
    servers: [{ url: baseUrl, description: 'API server' }],
  });

  // Add security schemes to the document
  doc.components ??= {};
  doc.components.securitySchemes ??= {};
  doc.components.securitySchemes['cookieAuth'] = {
    type: 'apiKey',
    in: 'cookie',
    name: 'better-auth.session-token',
    description: 'Session cookie for authentication',
  };

  // Add tag groups for better organization in documentation UI
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any)['x-tag-groups'] = [
    {
      name: 'Matters Management',
      tags: ['Matters: General', 'Matters: Notes', 'Matters: Time Entries', 'Matters: Expenses', 'Matters: Milestones'],
    },
    {
      name: 'Stripe Connect',
      tags: ['Stripe Connect'],
    },
  ];

  return doc;
};

// Serve OpenAPI spec at /doc endpoint (required by Scalar)
// Scalar needs a URL to fetch the OpenAPI JSON specification
app.get('/doc', (c) => c.json(buildOpenApiDocument()));

// Serve LLM-friendly Markdown
app.get('/llms.txt', async (c) => {
  const markdown = await createMarkdownFromOpenApi(buildOpenApiDocument());
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
