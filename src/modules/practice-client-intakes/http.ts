import * as handlers from '@/modules/practice-client-intakes/handlers';
import * as routes from '@/modules/practice-client-intakes/routes';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const practiceClientIntakesApp = createHonoApp();

// ==================== PRACTICE CLIENT INTAKES ====================
practiceClientIntakesApp.openapi(routes.getIntakeSettingsRoute, handlers.getIntakeSettingsHandler);
practiceClientIntakesApp.openapi(routes.createPracticeClientIntakeRoute, handlers.createPracticeClientIntakeHandler);
practiceClientIntakesApp.openapi(
  routes.createPracticeClientIntakeCheckoutSessionRoute,
  handlers.createPracticeClientIntakeCheckoutSessionHandler,
);
practiceClientIntakesApp.openapi(routes.updatePracticeClientIntakeRoute, handlers.updatePracticeClientIntakeHandler);
practiceClientIntakesApp.openapi(
  routes.getPracticeClientIntakeStatusRoute,
  handlers.getPracticeClientIntakeStatusHandler,
);
practiceClientIntakesApp.openapi(
  routes.getPracticeClientIntakePostPayStatusRoute,
  handlers.getPracticeClientIntakePostPayStatusHandler,
);
practiceClientIntakesApp.openapi(routes.claimPracticeClientIntakeRoute, handlers.claimPracticeClientIntakeHandler);
practiceClientIntakesApp.openapi(routes.triggerIntakeInvitationRoute, handlers.triggerIntakeInvitationHandler);
practiceClientIntakesApp.openapi(routes.listIntakesRoute, handlers.listIntakesHandler);
practiceClientIntakesApp.openapi(routes.convertIntakeRoute, handlers.convertIntakeHandler);

registerOpenApiRoutes(practiceClientIntakesApp, routes);

export default practiceClientIntakesApp;
