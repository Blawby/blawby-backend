import { OpenAPIHono } from '@hono/zod-openapi';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';
import type { AppContext } from '@/shared/types/hono';
import * as routes from '@/modules/clients/routes';
import * as handlers from '@/modules/clients/handlers';

const clientsApp = new OpenAPIHono<AppContext>();

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
