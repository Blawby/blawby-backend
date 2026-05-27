import { z } from '@hono/zod-openapi';
import {
  updateIntakeProfileSchema,
  clientIntakeProfileSchema,
} from '@/modules/clients/validations/client-intake-profiles.validation';
import {
  createMemoSchema,
  updateMemoSchema,
  memoParamsSchema,
  clientMemoSchema,
} from '@/modules/clients/validations/client-memos.validation';
import {
  updateClientSchema,
  listClientsSchema,
  clientParamsSchema,
  practiceParamsSchema,
  clientSchema,
} from '@/modules/clients/validations/clients.validation';
import { routeBuilder } from '@/shared/router/route-builder';

// ==================== CLIENTS ====================

export const listClientsRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}',
  tags: ['Clients'],
  summary: 'List clients',
  description: 'Get all clients for an organization.',
  request: {
    params: practiceParamsSchema,
    query: listClientsSchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ data: z.array(clientSchema), total: z.number() }) } },
      description: 'Clients retrieved successfully',
    },
  },
});

export const getClientRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/{client_id}',
  tags: ['Clients'],
  summary: 'Get client',
  description: 'Get a specific client by ID.',
  request: {
    params: clientParamsSchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ data: clientSchema }) } },
      description: 'Client retrieved successfully',
    },
  },
});

// Note: No POST/create route - clients are created via intake or invitation flows

export const updateClientRoute = routeBuilder.build({
  method: 'patch',
  path: '/{practice_id}/{client_id}',
  tags: ['Clients'],
  summary: 'Update client',
  description: 'Update client profile',
  request: {
    params: clientParamsSchema,
    body: { content: { 'application/json': { schema: updateClientSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ data: clientSchema }) } },
      description: 'Client updated',
    },
  },
});

export const deleteClientRoute = routeBuilder.build({
  method: 'delete',
  path: '/{practice_id}/{client_id}',
  tags: ['Clients'],
  summary: 'Delete client',
  description: 'Delete a client (soft delete)',
  request: { params: clientParamsSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      description: 'Client deleted',
    },
  },
});

// ==================== CLIENT MEMOS ====================

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
    200: {
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      description: 'Memo deleted',
    },
  },
});

// ==================== CLIENT INTAKE PROFILE ====================

export const getClientIntakeProfileRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/{client_id}/intake-profile',
  tags: ['Clients: Intake Profile'],
  summary: 'Get client intake profile',
  description: 'Get the eligibility, discount, and intake metadata for a client.',
  request: { params: clientParamsSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: clientIntakeProfileSchema } },
      description: 'Intake profile retrieved',
    },
  },
});

export const updateClientIntakeProfileRoute = routeBuilder.build({
  method: 'put',
  path: '/{practice_id}/{client_id}/intake-profile',
  tags: ['Clients: Intake Profile'],
  summary: 'Upsert client intake profile',
  description:
    'Create or update the client intake profile. Supports partial updates — only include fields you want to change.',
  request: {
    params: clientParamsSchema,
    body: { content: { 'application/json': { schema: updateIntakeProfileSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: clientIntakeProfileSchema } },
      description: 'Intake profile saved',
    },
  },
});
