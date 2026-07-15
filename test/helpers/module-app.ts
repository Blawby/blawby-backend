import { requireAuth } from '@/shared/middleware/auth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { Hono } from 'hono';

type ModuleProtection = 'public' | 'auth' | 'organization';

interface ModuleTestAppOptions {
  protection?: ModuleProtection;
}

/**
 * Creates a lightweight host for one module app without importing hono-app.ts.
 * Mount the module with app.route(), then use createRequest(app.fetch) or app.request().
 */
export const createModuleTestApp = ({ protection = 'organization' }: ModuleTestAppOptions = {}): Hono => {
  const app = new Hono();

  if (protection === 'public') {
    return app;
  }

  app.use('/api/*', requireAuth());
  if (protection === 'organization') {
    app.use('/api/*', requireOrgMembership());
  }

  return app;
};
