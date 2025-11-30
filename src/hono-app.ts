import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { RegExpRouter } from 'hono/router/reg-exp-router';
import { SmartRouter } from 'hono/router/smart-router';
import { TrieRouter } from 'hono/router/trie-router';

import { bootApplication } from '@/boot';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';

import {
  logger,
  cors,
  responseMiddleware,
  notFoundHandler,
  errorHandler,
} from '@/shared/middleware';

import { normalizeAuthResponse } from '@/shared/middleware/normalizeAuthResponse';
import { sanitizeAuthResponse } from '@/shared/middleware/sanitizeAuthResponse';
import { registerModuleRoutes } from '@/shared/router/module-router';
import { MODULE_REGISTRY } from '@/shared/router/modules.generated';
import type { AppContext } from '@/shared/types/hono';

// Automatically collect OpenAPI routes from all OpenAPIHono modules
// This iterates through the module registry and mounts any OpenAPIHono instances

const app = new Hono<AppContext>({
  router: new SmartRouter({
    routers: [new RegExpRouter(), new TrieRouter()],
  }),
});

const authInstance = createBetterAuthInstance(db);

// Middlewares – order is important!
app.use('*', logger());
app.use('*', cors());
app.use('*', responseMiddleware());

// Apply auth-specific middlewares only to auth routes
app.use('/api/auth/*', normalizeAuthResponse()); // Normalize Better Auth responses first
app.use('/api/auth/*', sanitizeAuthResponse()); // Then sanitize (remove token field)

// Mount Better Auth handler
app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  return authInstance.handler(c.req.raw);
});

// Root route
app.get('/', (c) => {
  return c.json({
    message: 'Hono server is running!',
    timestamp: new Date().toISOString(),
    routes: ['/health', '/api/health', '/api/session', '/docs'],
  });
});

// Health check routes
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    framework: 'hono',
    timestamp: new Date().toISOString(),
  });
});
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Register additional module routes
await registerModuleRoutes(app);

// Create OpenAPI app for documentation - collect routes from all OpenAPIHono modules
const openApiApp = new OpenAPIHono<AppContext>({
  router: new SmartRouter({
    routers: [new RegExpRouter(), new TrieRouter()],
  }),
});
for (const module of MODULE_REGISTRY) {
  if (module.http instanceof OpenAPIHono) {
    const mountPath = `/api/${module.name}`;
    openApiApp.route(mountPath, module.http);
  }
}

// Serve OpenAPI spec at /doc endpoint (required by Scalar)
// Scalar needs a URL to fetch the OpenAPI JSON specification
app.get('/doc', (c) => {
  return c.json(
    openApiApp.getOpenAPIDocument({
      openapi: '3.0.0',
      info: {
        title: 'Blawby API',
        version: '1.0.0',
        description: 'API documentation for Blawby backend services',
      },
    }),
  );
});

// Scalar API documentation UI - fetches OpenAPI spec from /doc endpoint
app.get('/scalar', Scalar({ url: '/doc' }));

// Boot application
void bootApplication();

// Not found and error handlers
app.notFound(notFoundHandler);
app.onError(errorHandler);

export default app;
