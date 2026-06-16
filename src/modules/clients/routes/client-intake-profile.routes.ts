import {
  updateIntakeProfileSchema,
  clientIntakeProfileSchema,
} from '@/modules/clients/validations/client-intake-profiles.validation';
import { clientIntakeProfilesService } from '@/modules/clients/services/client-intake-profiles.service';
import { clientParamsSchema } from '@/modules/clients/validations/clients.validation';
import { routeBuilder } from '@/shared/router/route-builder';

export const getClientIntakeProfileRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/{client_id}',
  tags: ['Clients: Intake Profile'],
  summary: 'Get client intake profile',
  description: 'Get the eligibility, discount, and intake metadata for a client.',
  mcp: {
    name: 'get_client_intake_profile',
    scope: 'clients:read',
    handler: async (args, ctx) => clientIntakeProfilesService.getProfile({ clientId: args.client_id as string }, ctx),
  },
  request: { params: clientParamsSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: clientIntakeProfileSchema } },
      description: 'Intake profile retrieved',
    },
  },
});

export const updateClientIntakeProfileRoute = routeBuilder.build({
  method: 'patch',
  path: '/{practice_id}/{client_id}',
  tags: ['Clients: Intake Profile'],
  summary: 'Upsert client intake profile',
  description:
    'Create or update the client intake profile. Supports partial updates — only include fields you want to change.',
  mcp: {
    name: 'update_client_intake_profile',
    scope: 'clients:write',
    schema: { client_id: clientParamsSchema.shape.client_id, ...updateIntakeProfileSchema.shape },
    handler: async (args, ctx) => {
      const { client_id, ...data } = args;
      return clientIntakeProfilesService.upsertProfile(
        {
          clientId: client_id as string,
          data: data as Parameters<typeof clientIntakeProfilesService.upsertProfile>[0]['data'],
        },
        ctx
      );
    },
  },
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
