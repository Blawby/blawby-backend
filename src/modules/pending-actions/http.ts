import { handlers } from '@/modules/pending-actions/handlers';
import { routes } from '@/modules/pending-actions/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/auth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const app = createHonoApp();
app.use('*', requireAuth(), requireOrgMembership(), injectAbility());

app.openapi(routes.listPendingActionsRoute, handlers.listPendingActionsHandler);
app.openapi(routes.getPendingActionRoute, handlers.getPendingActionHandler);
app.openapi(routes.approvePendingActionRoute, handlers.approvePendingActionHandler);
app.openapi(routes.rejectPendingActionRoute, handlers.rejectPendingActionHandler);

registerOpenApiRoutes(app, routes);

export default app;
