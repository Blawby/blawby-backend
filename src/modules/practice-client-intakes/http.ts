import { handlers } from '@/modules/practice-client-intakes/handlers';
import { publicRoutes } from '@/modules/practice-client-intakes/routes/public.routes';
import { clientRoutes } from '@/modules/practice-client-intakes/routes/client.routes';
import { intakeFileRoutes } from '@/modules/practice-client-intakes/routes/intake-files.routes';
import { staffRoutes } from '@/modules/practice-client-intakes/routes/staff.routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';

const practiceClientIntakesApp = createHonoApp();
const uuidPath = ':uuid{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}';

// Public routes — no auth required
const publicApp = createHonoApp();
publicApp.use('*', injectAbility());
publicApp.openapi(
  publicRoutes.getPracticeClientIntakePostPayStatusRoute,
  handlers.getPracticeClientIntakePostPayStatusHandler
);
publicApp.openapi(publicRoutes.createPracticeClientIntakeRoute, handlers.createPracticeClientIntakeHandler);
publicApp.openapi(publicRoutes.getIntakeSettingsRoute, handlers.getIntakeSettingsHandler);

// Client routes — authenticated but no org membership required
const clientApp = createHonoApp();
clientApp.use(`/${uuidPath}`, requireAuth(), injectAbility());
clientApp.use(`/${uuidPath}/checkout-session`, requireAuth(), injectAbility());
clientApp.use(`/${uuidPath}/status`, requireAuth(), injectAbility());
clientApp.use(`/${uuidPath}/files`, requireAuth(), injectAbility());
clientApp.use(`/${uuidPath}/files/*`, requireAuth(), injectAbility());
clientApp.openapi(
  clientRoutes.createPracticeClientIntakeCheckoutSessionRoute,
  handlers.createPracticeClientIntakeCheckoutSessionHandler
);
clientApp.openapi(clientRoutes.updatePracticeClientIntakeRoute, handlers.updatePracticeClientIntakeHandler);
clientApp.openapi(clientRoutes.getPracticeClientIntakeStatusRoute, handlers.getPracticeClientIntakeStatusHandler);
clientApp.openapi(intakeFileRoutes.presignIntakeFileRoute, handlers.presignIntakeFileHandler);
clientApp.openapi(intakeFileRoutes.listIntakeFilesRoute, handlers.listIntakeFilesHandler);
clientApp.openapi(intakeFileRoutes.confirmIntakeFileRoute, handlers.confirmIntakeFileHandler);
clientApp.openapi(intakeFileRoutes.deleteIntakeFileRoute, handlers.deleteIntakeFileHandler);

// Staff routes — org membership required
const staffApp = createHonoApp();
staffApp.use('*', requireAuth(), requireOrgMembership(), injectAbility());
staffApp.openapi(staffRoutes.triggerIntakeInvitationRoute, handlers.triggerIntakeInvitationHandler);
staffApp.openapi(staffRoutes.listIntakesRoute, handlers.listIntakesHandler);
staffApp.openapi(staffRoutes.getIntakeRoute, handlers.getIntakeHandler);
staffApp.openapi(staffRoutes.updateIntakeTriageStatusRoute, handlers.updateIntakeTriageStatusHandler);
staffApp.openapi(staffRoutes.convertIntakeRoute, handlers.convertIntakeHandler);

practiceClientIntakesApp.route('/', publicApp);
practiceClientIntakesApp.route('/', clientApp);
practiceClientIntakesApp.route('/staff', staffApp);

export default practiceClientIntakesApp;
