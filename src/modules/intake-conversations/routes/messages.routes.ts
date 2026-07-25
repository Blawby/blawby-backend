import {
  intakeConversationMessageResponseSchema,
  listMessagesQuerySchema,
} from '@/modules/intake-conversations/types/intake-conversations.types';
import { intakeConversationMessagesService } from '@/modules/intake-conversations/services/intake-conversation-messages.service';
import { routeBuilder } from '@/shared/router/route-builder';
import { z } from '@hono/zod-openapi';

const tags = ['Intake Conversations'];

const listConversationMessagesToolSchema = { id: z.uuid(), ...listMessagesQuerySchema.shape };

export const listIntakeConversationMessagesRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/{id}/messages',
  tags,
  summary: 'List messages for an intake conversation',
  mcp: {
    name: 'list_intake_conversation_messages',
    scope: 'intakes:read',
    schema: listConversationMessagesToolSchema,
    handler: async (args, ctx) => {
      const { id, ...query } = z.object(listConversationMessagesToolSchema).parse(args);
      return intakeConversationMessagesService.listMessages(id, query, ctx);
    },
  },
  request: {
    params: z.object({ practice_id: z.uuid(), id: z.uuid() }),
    query: listMessagesQuerySchema,
  },
  responses: {
    200: {
      description: 'Paginated list of messages',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(intakeConversationMessageResponseSchema),
            page_info: z.object({
              has_next_page: z.boolean(),
              has_previous_page: z.boolean(),
              next_cursor: z.string().nullable(),
              previous_cursor: z.string().nullable(),
            }),
          }),
        },
      },
    },
  },
});
