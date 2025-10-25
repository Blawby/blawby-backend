import { Hono } from 'hono';
import type { AppContext } from '@/shared/types/hono';

const publicApp = new Hono<AppContext>();

// Note: This module is configured as PUBLIC in module-router.ts
// No authentication required for these routes

// GET /api/public/health
publicApp.get('/health', async (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Public health check endpoint',
  });
});

// GET /api/public/info
publicApp.get('/info', async (c) => {
  return c.json({
    name: 'Blawby API',
    version: '1.0.0',
    description: 'Legal practice management API',
  });
});

// POST /api/public/contact
publicApp.post('/contact', async (c) => {
  const body = await c.req.json();

  // This is a public endpoint - no auth required
  return c.json({
    message: 'Contact form submitted',
    data: body,
  }, 201);
});

export default publicApp;
