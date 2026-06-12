import type {
  deleteIntakeConversationRoute,
  getIntakeConversationRoute,
  listIntakeConversationsRoute,
  updateIntakeConversationRoute,
} from '@/modules/intake-conversations/routes/core.routes';
import type { listIntakeConversationMessagesRoute } from '@/modules/intake-conversations/routes/messages.routes';
import { intakeConversationMessagesService } from '@/modules/intake-conversations/services/intake-conversation-messages.service';
import { intakeConversationsService } from '@/modules/intake-conversations/services/intake-conversations.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

export const listIntakeConversationsHandler: AppRouteHandler<typeof listIntakeConversationsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  const query = c.req.valid('query');
  const result = await intakeConversationsService.listIntakeConversations({ ...query, practice_id }, ctx);
  return c.json(result, 200);
};

export const getIntakeConversationHandler: AppRouteHandler<typeof getIntakeConversationRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id } = c.req.valid('param');
  const data = await intakeConversationsService.getIntakeConversation(id, ctx);
  return c.json({ data }, 200);
};

export const updateIntakeConversationHandler: AppRouteHandler<typeof updateIntakeConversationRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const data = await intakeConversationsService.updateIntakeConversation(id, body, ctx);
  return c.json({ data }, 200);
};

export const deleteIntakeConversationHandler: AppRouteHandler<typeof deleteIntakeConversationRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id } = c.req.valid('param');
  await intakeConversationsService.deleteIntakeConversation(id, ctx);
  return c.body(null, 204);
};

export const listIntakeConversationMessagesHandler: AppRouteHandler<
  typeof listIntakeConversationMessagesRoute
> = async (c) => {
  const ctx = getServiceContext(c);
  const { id } = c.req.valid('param');
  const query = c.req.valid('query');
  const data = await intakeConversationMessagesService.listMessages(id, query, ctx);
  return c.json(data, 200);
};
