import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { RegExpRouter } from 'hono/router/reg-exp-router';
import { SmartRouter } from 'hono/router/smart-router';
import { TrieRouter } from 'hono/router/trie-router';
import { bootApplication } from '@/boot';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { sql } from 'drizzle-orm';
import {
  logger,
  cors,
  responseMiddleware,
  notFoundHandler,
  errorHandler,
} from '@/shared/middleware';
import { normalizeAuthResponse } from '@/shared/middleware/normalizeAuthResponse';
import { sanitizeAuthResponse } from '@/shared/middleware/sanitizeAuthResponse';
import { autoCreateOrgForSubscription } from '@/shared/middleware/autoCreateOrgForSubscription';
import { registerModuleRoutes } from '@/shared/router/module-router';
import { MODULE_REGISTRY } from '@/shared/router/modules.generated';
import type { AppContext } from '@/shared/types/hono';
import type { BetterAuthInstance } from '@/shared/auth/better-auth';

// Automatically collect OpenAPI routes from all OpenAPIHono modules
// This iterates through the module registry and mounts any OpenAPIHono instances

const app = new Hono<AppContext>({
  router: new SmartRouter({
    routers: [new RegExpRouter(), new TrieRouter()],
  }),
});

// Lazy initialization - only create when needed (after env vars are loaded)
const getAuthInstance = (): BetterAuthInstance => createBetterAuthInstance(db);

// Middlewares – order is important!
app.use('*', logger());
app.use('*', cors());
app.use('*', responseMiddleware());

// Apply auth-specific middlewares only to auth routes
app.use('/api/auth/*', normalizeAuthResponse()); // Normalize Better Auth responses first
app.use('/api/auth/*', sanitizeAuthResponse()); // Then sanitize (remove token field)
app.use('/api/auth/*', autoCreateOrgForSubscription()); // Auto-create org for subscriptions

// Mount Better Auth handler
app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  const authInstance = getAuthInstance();
  return authInstance.handler(c.req.raw);
});

// Root route
app.get('/', (c) => {
  return c.json({
    message: 'Hono server is running!',
    timestamp: new Date().toISOString(),
    routes: ['/api/health', '/api/session', '/docs'],
  });
});

app.get('/api/health', async (c) => {
  const health = {
    status: 'ok' as 'ok' | 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      status: 'unknown' as 'connected' | 'disconnected' | 'unknown',
      latency: null as number | null,
    }
  };

  // Check database connection
  try {
    const startTime = Date.now();
    await db.execute(sql`SELECT 1`);
    const latency = Date.now() - startTime;

    health.database.status = 'connected';
    health.database.latency = latency;
  } catch {
    health.status = 'degraded';
    health.database.status = 'disconnected';
    health.database.latency = null;
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  return c.json(health, statusCode);
});

// Register additional module routes
await registerModuleRoutes(app);

// Create OpenAPI app for documentation - collect routes from all OpenAPIHono modules
const openApiApp = new OpenAPIHono<AppContext>({
  router: new SmartRouter({
    routers: [new RegExpRouter(), new TrieRouter()],
  }),
});

// Configure OpenAPI security scheme
openApiApp.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Bearer token authentication. Get token from /api/auth/sign-in/email endpoint.',
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
  const doc = openApiApp.getOpenAPIDocument({
    openapi: '3.0.0',
    info: {
      title: 'Blawby API',
      version: '1.0.0',
      description: 'API documentation for Blawby backend services',
    },
  });

  // Add security schemes to the document
  if (!doc.components) {
    doc.components = {};
  }
  if (!doc.components.securitySchemes) {
    doc.components.securitySchemes = {};
  }
  doc.components.securitySchemes.Bearer = {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Bearer token authentication. Get token from /api/auth/sign-in/email endpoint.',
  };

  return c.json(doc);
});

// Scalar API documentation UI - fetches OpenAPI spec from /doc endpoint
app.get('/scalar', Scalar({ url: '/doc' }));

// Boot application
void bootApplication();

// Not found and error handlers
app.notFound(notFoundHandler);
app.onError(errorHandler);

export default app;
