import { krabiclawFacadeMiddleware } from '@/modules/krabiclaw-integration/middleware/krabiclaw-facade.middleware';
import { rateLimit } from '@/shared/middleware/rateLimit';
import { createHonoApp } from '@/shared/router/factory';

const app = createHonoApp();

app.use(
  '*',
  krabiclawFacadeMiddleware(),
  rateLimit({
    routeKey: 'krabiclaw-facade',
    scope: (c) => {
      const context = c.get('legalOperationContext');
      return context ? `org:${context.organizationId}` : null;
    },
  })
);

// No routes yet — U8 mounts the Route Scope table's handlers here.

export const mountPath = '/api/integrations/krabiclaw/v1';
export default app;
