import { handlers } from '@/modules/engagement-contracts/handlers';
import { routes } from '@/modules/engagement-contracts/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const app = createHonoApp();

const clientApp = createHonoApp();
clientApp.use('*', requireAuth(), injectAbility());
clientApp.openapi(routes.getEngagementContractRoute, handlers.getEngagementContractHandler);

const staffApp = createHonoApp();
staffApp.use('*', requireAuth(), requireOrgMembership(), injectAbility());
staffApp.openapi(routes.createEngagementContractRoute, handlers.createEngagementContractHandler);
staffApp.openapi(routes.listEngagementContractsRoute, handlers.listEngagementContractsHandler);
staffApp.openapi(routes.updateEngagementContractRoute, handlers.updateEngagementContractHandler);
staffApp.openapi(routes.updateEngagementContractStatusRoute, handlers.updateEngagementContractStatusHandler);

app.route('/', clientApp);
app.route('/', staffApp);

registerOpenApiRoutes(app, routes);

export default app;
