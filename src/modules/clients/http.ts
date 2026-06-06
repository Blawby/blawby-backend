import { handlers } from '@/modules/clients/handlers';
import { routes } from '@/modules/clients/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const app = createHonoApp();

// TODO: migrate clients and memos routes to dedicated sub-apps (split by resource, follow intakeProfileApp pattern)
const staffApp = createHonoApp();
staffApp.use('*', requireAuth(), requireOrgMembership(), injectAbility());

staffApp.openapi(routes.listClientsRoute, handlers.listClientsHandler);
staffApp.openapi(routes.getClientRoute, handlers.getClientHandler);
staffApp.openapi(routes.updateClientRoute, handlers.updateClientHandler);
staffApp.openapi(routes.deleteClientRoute, handlers.deleteClientHandler);

staffApp.openapi(routes.listClientMemosRoute, handlers.listClientMemosHandler);
staffApp.openapi(routes.createClientMemoRoute, handlers.createClientMemoHandler);
staffApp.openapi(routes.updateClientMemoRoute, handlers.updateClientMemoHandler);
staffApp.openapi(routes.deleteClientMemoRoute, handlers.deleteClientMemoHandler);

const intakeProfileApp = createHonoApp();
intakeProfileApp.use('*', requireAuth(), requireOrgMembership(), injectAbility());

intakeProfileApp.openapi(routes.getClientIntakeProfileRoute, handlers.getClientIntakeProfileHandler);
intakeProfileApp.openapi(routes.updateClientIntakeProfileRoute, handlers.updateClientIntakeProfileHandler);

app.route('/', staffApp);
app.route('/intake-profile', intakeProfileApp);

registerOpenApiRoutes(app, routes);

export default app;
