import { handlers } from '@/modules/invoices/handlers';
import { routes } from '@/modules/invoices/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';
import { refundRequestHandlers } from '@/modules/invoices/refund-requests.handlers';
import { refundRequestRoutes } from '@/modules/invoices/refund-requests.routes';

const app = createHonoApp();
app.use('*', requireAuth(), requireOrgMembership(), injectAbility());

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

// ==================== REFUND REQUESTS ====================
app.openapi(refundRequestRoutes.createRefundRequestRoute, refundRequestHandlers.createRefundRequestHandler);
app.openapi(refundRequestRoutes.listClientRefundRequestsRoute, refundRequestHandlers.listClientRefundRequestsHandler);
app.openapi(refundRequestRoutes.cancelRefundRequestRoute, refundRequestHandlers.cancelRefundRequestHandler);
app.openapi(
  refundRequestRoutes.listPracticeRefundRequestsRoute,
  refundRequestHandlers.listPracticeRefundRequestsHandler
);
app.openapi(refundRequestRoutes.reviewRefundRequestRoute, refundRequestHandlers.reviewRefundRequestHandler);
app.openapi(refundRequestRoutes.executeRefundRoute, refundRequestHandlers.executeRefundHandler);

registerOpenApiRoutes(app, routes);

export default app;
