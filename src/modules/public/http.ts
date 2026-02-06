import { sql } from 'drizzle-orm';
import * as routes from '@/modules/public/routes';
import { db } from '@/shared/database';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';
import { response } from '@/shared/utils/responseUtils';

const publicApp = createHonoApp();

// Root route
publicApp.openapi(routes.rootRoute, async (c) => {
  return c.json({
    message: 'Hono server is running!',
    timestamp: new Date().toISOString(),
    routes: ['/api/health', '/api/session', '/docs'],
  });
});

// Health check
publicApp.openapi(routes.healthRoute, async (c) => {
  const health = {
    status: 'ok' as 'ok' | 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      status: 'unknown' as 'connected' | 'disconnected' | 'unknown',
      latency: null as number | null,
    },
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

// Note: This module is configured as prefix: '/' in routes.config.ts
// All paths are relative to root.

// Health Check
publicApp.openapi(routes.healthRoute, async (c) => {
  return response.ok(c, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Public health check endpoint',
  });
});

// API Info
publicApp.openapi(routes.infoRoute, async (c) => {
  return response.ok(c, {
    name: 'Blawby API',
    version: '1.0.0',
    description: 'Legal practice management API',
  });
});

// Contact Form
publicApp.openapi(routes.contactRoute, async (c) => {
  const body = c.req.valid('json');
  return response.created(c, {
    status: 'success',
    timestamp: new Date().toISOString(),
    message: 'Contact form submitted',
    data: body,
  });
});

registerOpenApiRoutes(publicApp, routes);

export default publicApp;
