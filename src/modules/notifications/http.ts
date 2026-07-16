import { listNotificationsHandler, markNotificationReadHandler } from '@/modules/notifications/handlers';
import { listNotificationsRoute, markNotificationReadRoute } from '@/modules/notifications/routes';
import { requireAuth } from '@/shared/middleware/auth';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';

const app = createHonoApp();

app.use('*', requireAuth(), requireOrgMembership(), injectAbility());
app.openapi(listNotificationsRoute, listNotificationsHandler);
app.openapi(markNotificationReadRoute, markNotificationReadHandler);

export default app;
