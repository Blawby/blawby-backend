import {
  intakeConversationMessageResponseSchema,
  listMessagesQuerySchema,
} from '@/modules/intake-conversations/types/intake-conversations.types';
import { routeBuilder } from '@/shared/router/route-builder';
import { z } from '@hono/zod-openapi';

const tags = ['Intake Conversations'];

export const listIntakeConversationMessagesRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/{id}/messages',
  tags,
  summary: 'List messages for an intake conversation',
  request: {
    params: z.object({ practice_id: z.uuid(), id: z.uuid() }),
    query: listMessagesQuerySchema,
  },
  responses: {
    200: {
      description: 'List of messages',
      content: { 'application/json': { schema: z.array(intakeConversationMessageResponseSchema) } },
    },
  },
});
