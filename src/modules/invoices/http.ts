import * as handlers from './handlers';
import * as routes from './routes';
import * as refundHandlers from './refund-requests.handlers';
import * as refundRoutes from './refund-requests.routes';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const app = createHonoApp();

// ==================== PRACTICE-SIDE INVOICES ====================
app.openapi(routes.createInvoiceRoute, handlers.createInvoiceHandler);
app.openapi(routes.getInvoicesRoute, handlers.getInvoicesHandler);
app.openapi(routes.updateInvoiceRoute, handlers.updateInvoiceHandler);
app.openapi(routes.deleteInvoiceRoute, handlers.deleteInvoiceHandler);
app.openapi(routes.sendInvoiceRoute, handlers.sendInvoiceHandler);
app.openapi(routes.syncInvoiceRoute, handlers.syncInvoiceHandler);
app.openapi(routes.voidInvoiceRoute, handlers.voidInvoiceHandler);

// ==================== CLIENT-SIDE INVOICES (read-only) ====================
app.openapi(routes.getClientInvoicesRoute, handlers.getClientInvoicesHandler);
app.openapi(routes.getClientInvoiceDetailRoute, handlers.getClientInvoiceDetailHandler);

// ==================== CLIENT REFUND REQUESTS ====================
// Note: specific paths must come before parameterized ones to avoid route conflicts
app.openapi(refundRoutes.listClientRefundRequestsRoute, refundHandlers.listClientRefundRequestsHandler);
app.openapi(refundRoutes.createRefundRequestRoute, refundHandlers.createRefundRequestHandler);
app.openapi(refundRoutes.cancelRefundRequestRoute, refundHandlers.cancelRefundRequestHandler);

// ==================== PRACTICE REFUND REQUESTS ====================
app.openapi(refundRoutes.listPracticeRefundRequestsRoute, refundHandlers.listPracticeRefundRequestsHandler);
app.openapi(refundRoutes.reviewRefundRequestRoute, refundHandlers.reviewRefundRequestHandler);
app.openapi(refundRoutes.executeRefundRoute, refundHandlers.executeRefundHandler);

registerOpenApiRoutes(app, { ...routes, ...refundRoutes });

export default app;
