import { handlers } from '@/modules/payouts/handlers';
import { routes } from '@/modules/payouts/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const app = createHonoApp();
app.use('*', injectAbility());

app.openapi(routes.listPayoutsRoute, handlers.listPayoutsHandler);
app.openapi(routes.getPayoutRoute, handlers.getPayoutHandler);

registerOpenApiRoutes(app, routes);

export default app;
