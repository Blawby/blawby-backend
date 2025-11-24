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

import { sanitizeAuthResponse } from '@/shared/middleware/sanitize-auth-response.middleware';
import { registerModuleRoutes } from '@/shared/router/module-router';
import type { AppContext } from '@/shared/types/hono';

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
app.use('*', sanitizeAuthResponse());

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

// Boot application
void bootApplication();

// Not found and error handlers
app.notFound(notFoundHandler);
app.onError(errorHandler);

export default app;
