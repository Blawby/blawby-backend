import * as handlers from '@/modules/clients/handlers';
import * as routes from '@/modules/clients/routes';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';


const clientsApp = createHonoApp();

// Clients
clientsApp.openapi(routes.listClientsRoute, handlers.listClientsHandler);
clientsApp.openapi(routes.createClientRoute, handlers.createClientHandler);
clientsApp.openapi(routes.getClientRoute, handlers.getClientHandler);
clientsApp.openapi(routes.updateClientRoute, handlers.updateClientHandler);
clientsApp.openapi(routes.deleteClientRoute, handlers.deleteClientHandler);

// Memos
clientsApp.openapi(routes.listClientMemosRoute, handlers.listClientMemosHandler);
clientsApp.openapi(routes.createClientMemoRoute, handlers.createClientMemoHandler);
clientsApp.openapi(routes.updateClientMemoRoute, handlers.updateClientMemoHandler);
clientsApp.openapi(routes.deleteClientMemoRoute, handlers.deleteClientMemoHandler);

// Register routes for OpenAPI documentation extraction
registerOpenApiRoutes(clientsApp, routes);

export default clientsApp;
