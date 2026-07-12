import { handlers } from '@/modules/audit-log/handlers';
import { routes } from '@/modules/audit-log/routes';
import { requireAuth } from '@/shared/middleware/auth';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const app = createHonoApp();
app.use('*', requireAuth(), requireOrgMembership(), injectAbility());
app.openapi(routes.listAuditLogRoute, handlers.listAuditLogHandler);
app.openapi(routes.exportAuditLogRoute, handlers.exportAuditLogHandler);
registerOpenApiRoutes(app, routes);

export const mountPath = '/api/practices';
export default app;
