import { getLogger } from '@logtape/logtape';
import { sql } from 'drizzle-orm';
import * as routes from '@/modules/public/routes';
import { db } from '@/shared/database';
import { createHonoApp } from '@/shared/router/factory';
import { response } from '@/shared/utils/responseUtils';

const logger = getLogger(['app', 'public', 'health']);

interface HealthStatus {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  database: {
    status: 'connected' | 'disconnected' | 'unknown';
    latency: number | null;
  };
}

const publicApp = createHonoApp();

// Root route
publicApp.openapi(routes.rootRoute, async (c) => response.ok(c, {
    message: 'Hono server is running!',
    timestamp: new Date().toISOString(),
    routes: ['/api/health', '/api/session', '/docs'],
  }));

// Health check
publicApp.openapi(routes.healthRoute, async (c) => {
  const health: HealthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      status: 'unknown',
      latency: null,
    },
  };

  // Check database connection
  try {
    const startTime = Date.now();
    await db.execute(sql`SELECT 1`);
    const latency = Date.now() - startTime;

    health.database.status = 'connected';
    health.database.latency = latency;
  } catch (error) {
    logger.error('Database health check failed: {error}', { error });
    health.status = 'degraded';
    health.database.status = 'disconnected';
  }

  if (health.status !== 'ok') {
    return c.json(health, 503);
  }
  return c.json(health, 200);
});

// Note: This module is configured as prefix: '/' in routes.config.ts
// All paths are relative to root.

// API Info
publicApp.openapi(routes.infoRoute, async (c) => response.ok(c, {
    name: 'Blawby API',
    version: '1.0.0',
    description: 'Legal practice management API',
  }));

// Contact Form
publicApp.openapi(routes.contactRoute, async (c) => {
  const body = c.req.valid('json');

  // TODO: Implement contact form submission processing (e.g., save to DB or send email)
  // Tracker: [ISSUE-123] - Hook up contact form to email/service layer
  // For now, this is a stub that returns success with sanitized data.

  return response.created(c, {
    status: 'success',
    timestamp: new Date().toISOString(),
    message: 'Contact form submitted',
    data: {
      name: body.name,
      subject: body.subject,
    },
  });
});

export default publicApp;
