import { z } from '@hono/zod-openapi';
import { memberProfilesService } from '@/modules/practice/services/member-profiles.service';
import { memberProfilesValidations } from '@/modules/practice/validations/member-profiles.validation';
import { routeBuilder } from '@/shared/router/route-builder';
import { notFoundResponseSchema } from '@/shared/validations/openapi';

const memberProfileParamsSchema = z.object({
  practice_id: z.uuid().openapi({
    param: { name: 'practice_id', in: 'path' },
    description: 'Practice ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
  user_id: z.uuid().openapi({
    param: { name: 'user_id', in: 'path' },
    description: "Member's user ID (UUID)",
    example: '123e4567-e89b-12d3-a456-426614174001',
  }),
});

export const getMemberProfileRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/members/{user_id}/profile',
  tags: ['Practice: Member Profile'],
  summary: 'Get member routing profile',
  mcp: {
    name: 'get_member_profile',
    scope: 'practice:read',
    schema: { user_id: z.uuid() },
    handler: async (args, ctx) => memberProfilesService.getProfile({ userId: args.user_id as string }, ctx),
  },
  description:
    "Get a practice member's routing and capacity metadata, including the live count of their current active matters.",
  request: { params: memberProfileParamsSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: memberProfilesValidations.memberProfileSchema } },
      description: 'Member profile retrieved',
    },
    404: {
      content: { 'application/json': { schema: notFoundResponseSchema } },
      description: 'Member profile not found',
    },
  },
});

export const updateMemberProfileRoute = routeBuilder.build({
  method: 'put',
  path: '/{practice_id}/members/{user_id}/profile',
  tags: ['Practice: Member Profile'],
  summary: 'Upsert member routing profile',
  mcp: {
    name: 'update_member_profile',
    scope: 'practice:write',
    schema: { user_id: z.uuid(), ...memberProfilesValidations.updateMemberProfileSchema.shape },
    handler: async (args, ctx) => {
      const { user_id, ...data } = args;
      return memberProfilesService.upsertProfile(
        {
          userId: user_id as string,
          data: data as Parameters<typeof memberProfilesService.upsertProfile>[0]['data'],
        },
        ctx
      );
    },
  },
  description:
    "Create or update a practice member's routing and capacity metadata. Supports partial updates — only include the fields you want to change.",
  request: {
    params: memberProfileParamsSchema,
    body: { content: { 'application/json': { schema: memberProfilesValidations.updateMemberProfileSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: memberProfilesValidations.memberProfileSchema } },
      description: 'Member profile saved',
    },
    404: {
      content: { 'application/json': { schema: notFoundResponseSchema } },
      description: 'Member profile not found',
    },
  },
});
