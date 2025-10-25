import { Hono } from 'hono';
import { RegExpRouter } from 'hono/router/reg-exp-router';
import { SmartRouter } from 'hono/router/smart-router';
import { TrieRouter } from 'hono/router/trie-router';
import { bootApplication } from '@/boot';
import publicApp from '@/modules/public/http';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import {
  logger, cors, responseMiddleware, notFoundHandler, errorHandler,
} from '@/shared/middleware';
import { sanitizeAuthResponse } from '@/shared/middleware/sanitize-auth-response.middleware';
import { registerModuleRoutes } from '@/shared/router/module-router';
import type { AppContext } from '@/shared/types/hono';

const app = new Hono<AppContext>({
  router: new SmartRouter({
    routers: [new RegExpRouter(), new TrieRouter()],
  }),
});

// Create Better Auth instance
const authInstance = createBetterAuthInstance(db);

// Apply middleware (order matters!)
app.use('*', logger());
app.use('*', cors());

// Mount public routes BEFORE auth middleware
app.route('/api/public', publicApp);

// Apply response middleware to all routes
app.use('*', responseMiddleware());

// Apply sanitize auth response middleware to all routes
app.use('*', sanitizeAuthResponse());

// Global error handler - handles all errors consistently
app.onError(errorHandler);

// Root route for testing
app.get('/', (c) => {
  return c.json({
    message: 'Hono server is running!',
    timestamp: new Date().toISOString(),
    routes: ['/health', '/api/health', '/api/session', '/docs'],
  });
});

// Better Auth routes
app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  return authInstance.handler(c.req.raw);
});

// Health check route (for testing)
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    framework: 'hono',
    timestamp: new Date().toISOString(),
    user: c.get('user'),
    userId: c.get('userId'),
  });
});

// API Health check route (matches existing Fastify route)
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Session endpoint (for testing auth)
app.get('/api/session', (c) => {
  const session = c.get('session');
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return c.json({
    session,
    user,
    userId: c.get('userId'),
    activeOrganizationId: c.get('activeOrganizationId'),
  });
});

// Register all module routes automatically
await registerModuleRoutes(app);

// Boot the application (event handlers, etc.)
void bootApplication();

// Not found handler
app.notFound(notFoundHandler);

export default app;
