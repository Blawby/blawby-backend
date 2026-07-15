import { handlers } from '@/modules/invoices/handlers';
import { routes } from '@/modules/invoices/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/auth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';
import { refundRequestRoutes } from '@/modules/invoices/routes/refund-requests.routes';

const app = createHonoApp();
app.use('*', requireAuth(), requireOrgMembership(), injectAbility());

// ==================== CLIENT-SIDE INVOICES (read-only) ====================
// Register before /:practice_id/:invoice_id so "client" is not parsed as a UUID.
app.openapi(routes.getClientInvoicesRoute, handlers.getClientInvoicesHandler);
app.openapi(routes.getClientInvoiceDetailRoute, handlers.getClientInvoiceDetailHandler);

// ==================== PRACTICE-SIDE INVOICES ====================
app.openapi(routes.createInvoiceRoute, handlers.createInvoiceHandler);
app.openapi(routes.listInvoicesRoute, handlers.listInvoicesHandler);
app.openapi(routes.getInvoiceRoute, handlers.getInvoiceHandler);
app.openapi(routes.updateInvoiceRoute, handlers.updateInvoiceHandler);
app.openapi(routes.deleteInvoiceRoute, handlers.deleteInvoiceHandler);
app.openapi(routes.sendInvoiceRoute, handlers.sendInvoiceHandler);
app.openapi(routes.syncInvoiceRoute, handlers.syncInvoiceHandler);
app.openapi(routes.voidInvoiceRoute, handlers.voidInvoiceHandler);
app.openapi(routes.transitionInvoiceStatusRoute, handlers.transitionInvoiceStatusHandler);

// ==================== REFUND REQUESTS ====================
app.openapi(refundRequestRoutes.createRefundRequestRoute, handlers.createRefundRequestHandler);
app.openapi(refundRequestRoutes.listClientRefundRequestsRoute, handlers.listClientRefundRequestsHandler);
app.openapi(refundRequestRoutes.cancelRefundRequestRoute, handlers.cancelRefundRequestHandler);
app.openapi(refundRequestRoutes.listPracticeRefundRequestsRoute, handlers.listPracticeRefundRequestsHandler);
app.openapi(refundRequestRoutes.reviewRefundRequestRoute, handlers.reviewRefundRequestHandler);
app.openapi(refundRequestRoutes.executeRefundRoute, handlers.executeRefundHandler);

registerOpenApiRoutes(app, routes);

export default app;
