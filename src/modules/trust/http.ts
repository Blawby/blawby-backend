import * as handlers from './handlers';
import * as routes from './routes';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const app = createHonoApp();

app.openapi(routes.getTrustTransactionsRoute, handlers.getTrustTransactionsHandler);
app.openapi(routes.getTrustBalanceRoute, handlers.getTrustBalanceHandler);
app.openapi(routes.getTrustReportRoute, handlers.getTrustReportHandler);

registerOpenApiRoutes(app, { ...routes });

export default app;
