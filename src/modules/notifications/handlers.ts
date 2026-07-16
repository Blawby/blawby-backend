import type { listNotificationsRoute, markNotificationReadRoute } from '@/modules/notifications/routes';
import { notificationsService } from '@/modules/notifications/services/notifications.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

export const listNotificationsHandler: AppRouteHandler<typeof listNotificationsRoute> = async (c) => {
  const result = await notificationsService.listMyNotifications(c.req.valid('query'), getServiceContext(c));
  return c.json(result, 200);
};

export const markNotificationReadHandler: AppRouteHandler<typeof markNotificationReadRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const data = await notificationsService.markRead(id, getServiceContext(c));
  return c.json({ data }, 200);
};
