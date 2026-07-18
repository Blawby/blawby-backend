import { handlers } from '@/modules/intake-template-suggestions/handlers';
import { routes } from '@/modules/intake-template-suggestions/routes';
import { requireAuth } from '@/shared/middleware/auth';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const app = createHonoApp();
app.use('*', requireAuth(), requireOrgMembership(), injectAbility());
app.openapi(routes.listSuggestionsRoute, handlers.listSuggestionsHandler);
app.openapi(routes.stageSuggestionRoute, handlers.stageSuggestionHandler);
app.openapi(routes.approveSuggestionRoute, handlers.approveSuggestionHandler);
app.openapi(routes.dismissSuggestionRoute, handlers.dismissSuggestionHandler);
registerOpenApiRoutes(app, routes);

export const mountPath = '/api/practice';
export default app;
