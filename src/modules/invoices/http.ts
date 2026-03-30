import { handlers } from '@/modules/invoices/handlers';
import { routes } from '@/modules/invoices/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const app = createHonoApp();
app.use('*', injectAbility());

// ==================== PRACTICE-SIDE INVOICES ====================
app.openapi(routes.createInvoiceRoute, handlers.createInvoiceHandler);
app.openapi(routes.listInvoicesRoute, handlers.listInvoicesHandler);
app.openapi(routes.getInvoiceRoute, handlers.getInvoiceHandler);
app.openapi(routes.updateInvoiceRoute, handlers.updateInvoiceHandler);
app.openapi(routes.deleteInvoiceRoute, handlers.deleteInvoiceHandler);
app.openapi(routes.sendInvoiceRoute, handlers.sendInvoiceHandler);
app.openapi(routes.syncInvoiceRoute, handlers.syncInvoiceHandler);
app.openapi(routes.voidInvoiceRoute, handlers.voidInvoiceHandler);

// ==================== CLIENT-SIDE INVOICES (read-only) ====================
app.openapi(routes.getClientInvoicesRoute, handlers.getClientInvoicesHandler);
app.openapi(routes.getClientInvoiceDetailRoute, handlers.getClientInvoiceDetailHandler);
app.openapi(routes.createRefundRequestRoute, handlers.createRefundRequestHandler as any);
app.openapi(routes.listClientRefundRequestsRoute, handlers.listClientRefundRequestsHandler as any);
app.openapi(routes.cancelRefundRequestRoute, handlers.cancelRefundRequestHandler as any);
app.openapi(routes.listPracticeRefundRequestsRoute, handlers.listPracticeRefundRequestsHandler as any);
app.openapi(routes.reviewRefundRequestRoute, handlers.reviewRefundRequestHandler as any);
app.openapi(routes.executeRefundRoute, handlers.executeRefundHandler as any);

registerOpenApiRoutes(app, routes);

export default app;
