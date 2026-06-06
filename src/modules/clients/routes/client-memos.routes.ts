import { z } from '@hono/zod-openapi';
import {
  createMemoSchema,
  updateMemoSchema,
  memoParamsSchema,
  clientMemoSchema,
} from '@/modules/clients/validations/client-memos.validation';
import { clientParamsSchema } from '@/modules/clients/validations/clients.validation';
import { routeBuilder } from '@/shared/router/route-builder';

export const listClientMemosRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/{client_id}/memos',
  tags: ['Clients: Memos'],
  summary: 'List client memos',
  description: 'Get all memos for a client',
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
  request: { params: memoParamsSchema },
  responses: {
    204: {
      description: 'Memo deleted',
    },
  },
});
