import { handlers } from '@/modules/clients/handlers';
import { routes } from '@/modules/clients/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const app = createHonoApp();

const clientsApp = createHonoApp();
clientsApp.use('*', requireAuth(), requireOrgMembership(), injectAbility());

clientsApp.openapi(routes.listClientsRoute, handlers.listClientsHandler);
clientsApp.openapi(routes.getClientRoute, handlers.getClientHandler);
clientsApp.openapi(routes.updateClientRoute, handlers.updateClientHandler);
clientsApp.openapi(routes.deleteClientRoute, handlers.deleteClientHandler);

const memosApp = createHonoApp();
memosApp.use('*', requireAuth(), requireOrgMembership(), injectAbility());

memosApp.openapi(routes.listClientMemosRoute, handlers.listClientMemosHandler);
memosApp.openapi(routes.createClientMemoRoute, handlers.createClientMemoHandler);
memosApp.openapi(routes.updateClientMemoRoute, handlers.updateClientMemoHandler);
memosApp.openapi(routes.deleteClientMemoRoute, handlers.deleteClientMemoHandler);

const intakeProfileApp = createHonoApp();
intakeProfileApp.use('*', requireAuth(), requireOrgMembership(), injectAbility());

intakeProfileApp.openapi(routes.getClientIntakeProfileRoute, handlers.getClientIntakeProfileHandler);
intakeProfileApp.openapi(routes.updateClientIntakeProfileRoute, handlers.updateClientIntakeProfileHandler);

app.route('/', clientsApp);
app.route('/', memosApp);
app.route('/intake-profile', intakeProfileApp);

registerOpenApiRoutes(app, routes);

export default app;
