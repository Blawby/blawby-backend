import { z } from '@hono/zod-openapi';
import {
  createMemoSchema,
  updateMemoSchema,
  memoParamsSchema,
  clientMemoSchema,
} from '@/modules/clients/validations/client-memos.validation';
import { clientParamsSchema } from '@/modules/clients/validations/clients.validation';
import { clientMemosService } from '@/modules/clients/services/client-memos.service';
import { routeBuilder } from '@/shared/router/route-builder';

export const listClientMemosRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/{client_id}/memos',
  tags: ['Clients: Memos'],
  summary: 'List client memos',
  description: 'Get all memos for a client',
  mcp: {
    name: 'list_client_memos',
    scope: 'clients:read',
    handler: async (args, ctx) => clientMemosService.listMemos({ clientId: args.client_id as string }, ctx),
  },
  request: { params: clientParamsSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ data: z.array(clientMemoSchema) }) } },
      description: 'Memos retrieved',
    },
  },
});

export const createClientMemoRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/{client_id}/memos',
  tags: ['Clients: Memos'],
  summary: 'Create client memo',
  description: 'Add a memo for a client',
  mcp: {
    name: 'create_client_memo',
    scope: 'clients:write',
    handler: async (args, ctx) => {
      const { client_id, event_time, ...data } = args;
      return clientMemosService.createMemo(
        {
          clientId: client_id as string,
          data: {
            ...data,
            event_time: typeof event_time === 'string' ? new Date(event_time) : undefined,
          } as Parameters<typeof clientMemosService.createMemo>[0]['data'],
        },
        ctx
      );
    },
  },
  request: {
    params: clientParamsSchema,
    body: { content: { 'application/json': { schema: createMemoSchema } } },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: z.object({ data: clientMemoSchema }) } },
      description: 'Memo created',
    },
  },
});

export const updateClientMemoRoute = routeBuilder.build({
  method: 'patch',
  path: '/{practice_id}/{client_id}/memos/{memo_id}',
  tags: ['Clients: Memos'],
  summary: 'Update client memo',
  description: 'Update a specific memo content',
  mcp: {
    name: 'update_client_memo',
    scope: 'clients:write',
    handler: async (args, ctx) => {
      const { client_id, memo_id, event_time, ...data } = args;
      return clientMemosService.updateMemo(
        {
          id: memo_id as string,
          clientId: client_id as string,
          data: {
            ...data,
            event_time: typeof event_time === 'string' ? new Date(event_time) : undefined,
          } as Parameters<typeof clientMemosService.updateMemo>[0]['data'],
        },
        ctx
      );
    },
  },
  request: { params: memoParamsSchema, body: { content: { 'application/json': { schema: updateMemoSchema } } } },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ data: clientMemoSchema }) } },
      description: 'Memo updated',
    },
  },
});

export const deleteClientMemoRoute = routeBuilder.build({
  method: 'delete',
  path: '/{practice_id}/{client_id}/memos/{memo_id}',
  tags: ['Clients: Memos'],
  summary: 'Delete client memo',
  description: 'Delete a specific memo',
  mcp: {
    name: 'delete_client_memo',
    scope: 'clients:write',
    handler: async (args, ctx) => {
      await clientMemosService.deleteMemo({ id: args.memo_id as string, clientId: args.client_id as string }, ctx);
      return { deleted: true };
    },
  },
  request: { params: memoParamsSchema },
  responses: {
    204: {
      description: 'Memo deleted',
    },
  },
});
