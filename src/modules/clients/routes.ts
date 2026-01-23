import { createRoute, z } from '@hono/zod-openapi';
import { createClientSchema, updateClientSchema, listClientsSchema, orgParamsSchema, clientParamsSchema } from '@/modules/clients/validations/clients.validation';
import { createMemoSchema, updateMemoSchema, memoParamsSchema } from '@/modules/clients/validations/client-memos.validation';

// Common response schemas
const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.any().optional(),
}).openapi('ErrorResponse');

const notFoundResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
}).openapi('NotFoundResponse');

// ==================== CLIENTS ====================

export const listClientsRoute = createRoute({
  method: 'get',
  path: '/organizations/{orgId}/clients',
  tags: ['Clients'],
  summary: 'List clients',
  description: 'Get all clients for an organization',
  request: {
    params: orgParamsSchema,
    query: listClientsSchema
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ data: z.array(z.any()), total: z.number() }) } },
      description: 'Clients retrieved successfully',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Invalid request' },
  },
});

export const createClientRoute = createRoute({
  method: 'post',
  path: '/organizations/{orgId}/clients',
  tags: ['Clients'],
  summary: 'Create client',
  description: 'Add a new client to the organization',
  request: {
    params: orgParamsSchema,
    body: { content: { 'application/json': { schema: createClientSchema } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: z.object({ data: z.any() }) } }, description: 'Client created' },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Invalid request' },
  },
});

export const getClientRoute = createRoute({
  method: 'get',
  path: '/organizations/{orgId}/clients/{uuid}',
  tags: ['Clients'],
  summary: 'Get client',
  description: 'Get a specific client by ID',
  request: { params: clientParamsSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ data: z.any() }) } }, description: 'Client details' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Client not found' },
  },
});

export const updateClientRoute = createRoute({
  method: 'put',
  path: '/organizations/{orgId}/clients/{uuid}',
  tags: ['Clients'],
  summary: 'Update client',
  description: 'Update client profile',
  request: {
    params: clientParamsSchema,
    body: { content: { 'application/json': { schema: updateClientSchema } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ data: z.any() }) } }, description: 'Client updated' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Client not found' },
  },
});

export const deleteClientRoute = createRoute({
  method: 'delete',
  path: '/organizations/{orgId}/clients/{uuid}',
  tags: ['Clients'],
  summary: 'Delete client',
  description: 'Delete a client (soft delete)',
  request: { params: clientParamsSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'Client deleted' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Client not found' },
  },
});

// ==================== CLIENT MEMOS ====================

export const listClientMemosRoute = createRoute({
  method: 'get',
  path: '/organizations/{orgId}/clients/{uuid}/memos',
  tags: ['Clients: Memos'],
  summary: 'List client memos',
  description: 'Get all memos for a client',
  request: { params: clientParamsSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ data: z.array(z.any()) }) } }, description: 'Memos retrieved' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Client not found' },
  },
});

export const createClientMemoRoute = createRoute({
  method: 'post',
  path: '/organizations/{orgId}/clients/{uuid}/memos',
  tags: ['Clients: Memos'],
  summary: 'Create client memo',
  description: 'Add a memo for a client',
  request: {
    params: clientParamsSchema,
    body: { content: { 'application/json': { schema: createMemoSchema } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: z.object({ data: z.any() }) } }, description: 'Memo created' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Client not found' },
  },
});

export const updateClientMemoRoute = createRoute({
  method: 'put',
  path: '/organizations/{orgId}/clients/{uuid}/memos/{memoId}',
  tags: ['Clients: Memos'],
  summary: 'Update client memo',
  description: 'Update a specific memo content',
  request: { params: memoParamsSchema, body: { content: { 'application/json': { schema: updateMemoSchema } } } },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ data: z.any() }) } }, description: 'Memo updated' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Memo or Client not found' },
  },
});

export const deleteClientMemoRoute = createRoute({
  method: 'delete',
  path: '/organizations/{orgId}/clients/{uuid}/memos/{memoId}',
  tags: ['Clients: Memos'],
  summary: 'Delete client memo',
  description: 'Delete a specific memo',
  request: { params: memoParamsSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'Memo deleted' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Memo or Client not found' },
  },
});
