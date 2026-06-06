import { handlers } from '@/modules/engagement-templates/handlers';
import { routes } from '@/modules/engagement-templates/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const app = createHonoApp();

app.use('*', injectAbility());

app.openapi(routes.listEngagementTemplatesRoute, handlers.listEngagementTemplatesHandler);
app.openapi(routes.createEngagementTemplateRoute, handlers.createEngagementTemplateHandler);
app.openapi(routes.updateEngagementTemplateRoute, handlers.updateEngagementTemplateHandler);
app.openapi(routes.deleteEngagementTemplateRoute, handlers.deleteEngagementTemplateHandler);

registerOpenApiRoutes(app, routes);

export default app;
