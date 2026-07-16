import { handlers } from '@/modules/practice-exports/handlers';
import { routes } from '@/modules/practice-exports/routes';
import { requireAuth } from '@/shared/middleware/auth';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const app = createHonoApp();
app.use('*', requireAuth(), requireOrgMembership(), injectAbility());
app.openapi(routes.requestPracticeExportRoute, handlers.requestPracticeExportHandler);
app.openapi(routes.getPracticeExportRoute, handlers.getPracticeExportHandler);
registerOpenApiRoutes(app, routes);

export const mountPath = '/api/practices';
export default app;
