import * as handlers from './handlers';
import * as routes from './routes';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const app = createHonoApp();

// ==================== INVOICES ====================
app.openapi(routes.createInvoiceRoute, handlers.createInvoiceHandler);
app.openapi(routes.getInvoicesRoute, handlers.getInvoicesHandler);
app.openapi(routes.getInvoiceRoute, handlers.getInvoiceHandler);
app.openapi(routes.updateInvoiceRoute, handlers.updateInvoiceHandler);
app.openapi(routes.deleteInvoiceRoute, handlers.deleteInvoiceHandler);
app.openapi(routes.sendInvoiceRoute, handlers.sendInvoiceHandler);
app.openapi(routes.syncInvoiceRoute, handlers.syncInvoiceHandler);

// ==================== PUBLIC PAYMENTS ====================
app.openapi(routes.getPublicInvoiceRoute, handlers.getPublicInvoiceHandler);

registerOpenApiRoutes(app, { ...routes });

export default app;
