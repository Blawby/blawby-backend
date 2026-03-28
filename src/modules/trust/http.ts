import { handlers } from '@/modules/trust/handlers';
import { trustRoutes as routes } from '@/modules/trust/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const app = createHonoApp();
app.use('*', injectAbility());

app.openapi(routes.createDepositRoute, handlers.createDepositHandler);
app.openapi(routes.createWithdrawalRoute, handlers.createWithdrawalHandler);
app.openapi(routes.getTrustTransactionsRoute, handlers.getTrustTransactionsHandler);
app.openapi(routes.getTrustBalanceRoute, handlers.getTrustBalanceHandler);
app.openapi(routes.getTrustReportRoute, handlers.getTrustReportHandler);

registerOpenApiRoutes(app, { ...routes });

export default app;
