import { z } from '@hono/zod-openapi';
import {
  updateClientSchema,
  listClientsSchema,
  clientParamsSchema,
  practiceParamsSchema,
  clientSchema,
} from '@/modules/clients/validations/clients.validation';
import { clientsService } from '@/modules/clients/services/clients-crud.service';
import { routeBuilder } from '@/shared/router/route-builder';

export const listClientsRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}',
  tags: ['Clients'],
  summary: 'List clients',
  description: 'Get all clients for an organization.',
  mcp: {
    scope: 'clients:read',
    handler: async (args, ctx) => clientsService.listClients(args as Parameters<typeof clientsService.listClients>[0], ctx),
  },
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
  mcp: {
    scope: 'clients:read',
    schema: { client_id: z.uuid() },
    handler: async (args, ctx) => clientsService.getClient({ id: args['client_id'] as string }, ctx),
  },
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
    204: {
      description: 'Client deleted',
    },
  },
});
