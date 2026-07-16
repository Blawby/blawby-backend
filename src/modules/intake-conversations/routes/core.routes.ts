import {
  intakeConversationResponseSchema,
  listIntakeConversationsQuerySchema,
  updateIntakeConversationSchema,
  type ListIntakeConversationsQuery,
} from '@/modules/intake-conversations/types/intake-conversations.types';
import { intakeConversationsService } from '@/modules/intake-conversations/services/intake-conversations.service';
import { routeBuilder } from '@/shared/router/route-builder';
import { z } from '@hono/zod-openapi';

const tags = ['Intake Conversations'];

export const listIntakeConversationsRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}',
  tags,
  summary: 'List intake conversations',
  mcp: {
    name: 'list_conversations',
    scope: 'intakes:read',
    handler: async (args, ctx) =>
      intakeConversationsService.listIntakeConversations(
        { ...args, practice_id: ctx.organizationId } as ListIntakeConversationsQuery,
        ctx
      ),
  },
  request: {
    params: z.object({ practice_id: z.uuid() }),
    query: listIntakeConversationsQuerySchema.omit({ practice_id: true }),
  },
  responses: {
    200: {
      description: 'Paginated list of intake conversations',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(intakeConversationResponseSchema),
            pagination: z.object({ total: z.number(), page: z.number(), limit: z.number() }),
          }),
        },
      },
    },
  },
});

export const getIntakeConversationRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/{id}',
  tags,
  summary: 'Get intake conversation by ID',
  mcp: {
    name: 'get_conversation',
    scope: 'intakes:read',
    schema: { id: z.uuid() },
    handler: async (args, ctx) => intakeConversationsService.getIntakeConversation(args.id as string, ctx),
  },
  request: {
    params: z.object({ practice_id: z.uuid(), id: z.uuid() }),
  },
  responses: {
    200: {
      description: 'Intake conversation',
      content: { 'application/json': { schema: z.object({ data: intakeConversationResponseSchema }) } },
    },
  },
});

export const updateIntakeConversationRoute = routeBuilder.build({
  method: 'patch',
  path: '/{practice_id}/{id}',
  tags,
  summary: 'Update intake conversation',
  request: {
    params: z.object({ practice_id: z.uuid(), id: z.uuid() }),
    body: { content: { 'application/json': { schema: updateIntakeConversationSchema } } },
  },
  responses: {
    200: {
      description: 'Updated intake conversation',
      content: { 'application/json': { schema: z.object({ data: intakeConversationResponseSchema }) } },
    },
  },
});

export const deleteIntakeConversationRoute = routeBuilder.build({
  method: 'delete',
  path: '/{practice_id}/{id}',
  tags,
  summary: 'Delete (archive) intake conversation',
  request: {
    params: z.object({ practice_id: z.uuid(), id: z.uuid() }),
  },
  responses: {
    204: { description: 'Deleted' },
  },
});
