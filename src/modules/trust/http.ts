import * as handlers from '@/modules/trust/handlers';
import * as routes from '@/modules/trust/routes';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const app = createHonoApp();

app.openapi(routes.createDepositRoute, handlers.createDepositHandler);
app.openapi(routes.createWithdrawalRoute, handlers.createWithdrawalHandler);
app.openapi(routes.getTrustTransactionsRoute, handlers.getTrustTransactionsHandler);
app.openapi(routes.getTrustBalanceRoute, handlers.getTrustBalanceHandler);
app.openapi(routes.getTrustReportRoute, handlers.getTrustReportHandler);

registerOpenApiRoutes(app, { ...routes });

export default app;
