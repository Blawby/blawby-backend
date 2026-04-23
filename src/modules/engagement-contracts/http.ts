import { engagementContractHandlers } from '@/modules/engagement-contracts/handlers';
import { routes } from '@/modules/engagement-contracts/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const app = createHonoApp();

app.use('*', injectAbility());

app.openapi(routes.createEngagementContractRoute, engagementContractHandlers.createEngagementContractHandler);
app.openapi(routes.listEngagementContractsRoute, engagementContractHandlers.listEngagementContractsHandler);
app.openapi(routes.getEngagementContractRoute, engagementContractHandlers.getEngagementContractHandler);
app.openapi(routes.updateEngagementContractRoute, engagementContractHandlers.updateEngagementContractHandler);
app.openapi(routes.updateEngagementContractStatusRoute, engagementContractHandlers.updateEngagementContractStatusHandler);

registerOpenApiRoutes(app, routes);

export default app;
