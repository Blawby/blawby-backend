import {
  listNotificationsQuerySchema,
  notificationListResponseSchema,
  notificationResponseSchema,
} from '@/modules/notifications/types/notifications.types';
import { routeBuilder } from '@/shared/router/route-builder';
import { z } from '@hono/zod-openapi';

const tags = ['Notifications'];

export const listNotificationsRoute = routeBuilder.build({
  method: 'get',
  path: '/',
  tags,
  summary: "List the current user's dashboard notifications",
  security: [{ Bearer: [] }],
  request: { query: listNotificationsQuerySchema },
  responses: {
    200: {
      description: 'Paginated dashboard notifications',
      content: { 'application/json': { schema: notificationListResponseSchema } },
    },
  },
});

export const markNotificationReadRoute = routeBuilder.build({
  method: 'patch',
  path: '/{id}/read',
  tags,
  summary: 'Mark one dashboard notification as read',
  security: [{ Bearer: [] }],
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: {
      description: 'Updated notification',
      content: { 'application/json': { schema: z.object({ data: notificationResponseSchema }) } },
    },
  },
});
