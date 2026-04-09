import { handlers } from '@/modules/practice-client-intakes/handlers';
import { publicRoutes } from '@/modules/practice-client-intakes/routes/public.routes';
import { clientRoutes } from '@/modules/practice-client-intakes/routes/client.routes';
import { staffRoutes } from '@/modules/practice-client-intakes/routes/staff.routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { createHonoApp } from '@/shared/router/factory';

const practiceClientIntakesApp = createHonoApp();

practiceClientIntakesApp.use('*', injectAbility());

// ==================== PRACTICE CLIENT INTAKES ====================
// Static routes must be registered before dynamic routes with path parameters
practiceClientIntakesApp.openapi(
  publicRoutes.getPracticeClientIntakePostPayStatusRoute,
  handlers.getPracticeClientIntakePostPayStatusHandler
);
practiceClientIntakesApp.openapi(
  publicRoutes.createPracticeClientIntakeRoute,
  handlers.createPracticeClientIntakeHandler
);
// Dynamic routes with path parameters
practiceClientIntakesApp.openapi(publicRoutes.getIntakeSettingsRoute, handlers.getIntakeSettingsHandler);
practiceClientIntakesApp.openapi(
  clientRoutes.createPracticeClientIntakeCheckoutSessionRoute,
  handlers.createPracticeClientIntakeCheckoutSessionHandler
);
practiceClientIntakesApp.openapi(
  clientRoutes.updatePracticeClientIntakeRoute,
  handlers.updatePracticeClientIntakeHandler
);
practiceClientIntakesApp.openapi(
  clientRoutes.getPracticeClientIntakeStatusRoute,
  handlers.getPracticeClientIntakeStatusHandler
);
practiceClientIntakesApp.openapi(staffRoutes.triggerIntakeInvitationRoute, handlers.triggerIntakeInvitationHandler);
practiceClientIntakesApp.openapi(staffRoutes.listIntakesRoute, handlers.listIntakesHandler);
practiceClientIntakesApp.openapi(staffRoutes.getIntakeRoute, handlers.getIntakeHandler);
practiceClientIntakesApp.openapi(staffRoutes.updateIntakeTriageStatusRoute, handlers.updateIntakeTriageStatusHandler);
practiceClientIntakesApp.openapi(staffRoutes.convertIntakeRoute, handlers.convertIntakeHandler);

export default practiceClientIntakesApp;
