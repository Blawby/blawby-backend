import { createHonoApp } from '@/shared/router/factory';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { routes } from '@/modules/intake-conversations/routes';
import * as handlers from '@/modules/intake-conversations/handlers';

const app = createHonoApp();

app.use('*', requireAuth(), requireOrgMembership(), injectAbility());

app.openapi(routes.listIntakeConversationsRoute, handlers.listIntakeConversationsHandler);
app.openapi(routes.getIntakeConversationRoute, handlers.getIntakeConversationHandler);
app.openapi(routes.updateIntakeConversationRoute, handlers.updateIntakeConversationHandler);
app.openapi(routes.deleteIntakeConversationRoute, handlers.deleteIntakeConversationHandler);
app.openapi(routes.listIntakeConversationMessagesRoute, handlers.listIntakeConversationMessagesHandler);

export default app;
