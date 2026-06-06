import * as handlers from '@/modules/clients/handlers';
import * as routes from '@/modules/clients/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const clientsApp = createHonoApp();

clientsApp.use('*', requireAuth(), requireOrgMembership(), injectAbility());

// Clients (Note: No POST/create - clients are created via intake or invitation flows)
clientsApp.openapi(routes.listClientsRoute, handlers.listClientsHandler);
clientsApp.openapi(routes.getClientRoute, handlers.getClientHandler);
clientsApp.openapi(routes.updateClientRoute, handlers.updateClientHandler);
clientsApp.openapi(routes.deleteClientRoute, handlers.deleteClientHandler);

// Memos
clientsApp.openapi(routes.listClientMemosRoute, handlers.listClientMemosHandler);
clientsApp.openapi(routes.createClientMemoRoute, handlers.createClientMemoHandler);
clientsApp.openapi(routes.updateClientMemoRoute, handlers.updateClientMemoHandler);
clientsApp.openapi(routes.deleteClientMemoRoute, handlers.deleteClientMemoHandler);

// Intake profile
clientsApp.openapi(routes.getClientIntakeProfileRoute, handlers.getClientIntakeProfileHandler);
clientsApp.openapi(routes.updateClientIntakeProfileRoute, handlers.updateClientIntakeProfileHandler);

// Register routes for OpenAPI documentation extraction
registerOpenApiRoutes(clientsApp, routes);

export default clientsApp;
