import { z } from '@hono/zod-openapi';
import { practiceIdParamOpenAPISchema, uuidParamOpenAPISchema } from '@/modules/practice-client-intakes/routes/shared';
import { intakeLifecycleService } from '@/modules/practice-client-intakes/services/intake-lifecycle.service';
import { intakeValidations } from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';
import { routeBuilder } from '@/shared/router/route-builder';

const triggerIntakeInvitationRoute = routeBuilder.build({
  method: 'post',
  path: '/{uuid}/invite',
  tags: ['Practice Client Intakes'],
  summary: 'Trigger intake invitation',
  description: 'Triggers a manual organization invitation for the client associated with a successful intake.',
  mcp: {
    name: 'trigger_intake_invitation',
    scope: 'intakes:write',
    approval: {
      required: true,
      message: 'Send an organization invitation for this intake client?',
      confirm_title: 'Send invitation',
    },
    schema: { uuid: z.uuid() },
    handler: async (args, ctx) => intakeLifecycleService.triggerInvitation({ uuid: args.uuid as string }, ctx),
  },
  request: {
    params: uuidParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: intakeValidations.triggerIntakeInvitationResponseSchema,
        },
      },
      description: 'Invitation triggered successfully.',
    },
    400: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Bad request - intake not found or not in a successful state',
    },
    401: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Unauthorized - authentication required',
    },
    500: {
      content: {
        'application/json': {
          schema: intakeValidations.internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

const listIntakesRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}',
  tags: ['Practice Client Intakes'],
  summary: 'List practice client intakes',
  description: 'Retrieves a paginated list of client intakes for a specific practice.',
  mcp: {
    name: 'list_intakes',
    scope: 'intakes:read',
    handler: async (args, ctx) =>
      intakeLifecycleService.listIntakes(
        { query: args as Parameters<typeof intakeLifecycleService.listIntakes>[0]['query'] },
        ctx
      ),
  },
  request: {
    params: practiceIdParamOpenAPISchema,
    query: intakeValidations.listIntakesQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: intakeValidations.listIntakesResponseSchema,
        },
      },
      description: 'List of intakes retrieved successfully.',
    },
    401: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Unauthorized',
    },
    500: {
      content: {
        'application/json': {
          schema: intakeValidations.internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

const getIntakeRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/{id}',
  tags: ['Practice Client Intakes'],
  summary: 'Get a practice client intake',
  description: 'Retrieves a single client intake by ID.',
  mcp: {
    name: 'get_intake',
    scope: 'intakes:read',
    schema: { id: z.uuid() },
    handler: async (args, ctx) => intakeLifecycleService.getIntakeById(args.id as string, ctx),
  },
  request: {
    params: z.object({
      practice_id: z.uuid(),
      id: z.uuid(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: intakeValidations.practiceClientIntakeStatusResponseSchema,
        },
      },
      description: 'Intake retrieved successfully.',
    },
    404: {
      content: {
        'application/json': {
          schema: intakeValidations.notFoundResponseSchema,
        },
      },
      description: 'Intake not found',
    },
    401: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Unauthorized',
    },
    500: {
      content: {
        'application/json': {
          schema: intakeValidations.internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

const updateIntakeTriageStatusRoute = routeBuilder.build({
  method: 'patch',
  path: '/{uuid}/status',
  tags: ['Practice Client Intakes'],
  summary: 'Update intake triage status',
  description: 'Sets practice triage decision for an intake.',
  mcp: {
    name: 'update_intake_triage_status',
    scope: 'intakes:write',
    handler: async (args, ctx) => {
      const { uuid, ...data } = args;
      return intakeLifecycleService.updateTriageStatus(
        { uuid: uuid as string, data: data as Parameters<typeof intakeLifecycleService.updateTriageStatus>[0]['data'] },
        ctx
      );
    },
  },
  request: {
    params: uuidParamOpenAPISchema,
    body: {
      content: {
        'application/json': {
          schema: intakeValidations.updateIntakeTriageStatusSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: intakeValidations.updateIntakeTriageStatusResponseSchema,
        },
      },
      description: 'Triage status updated successfully.',
    },
    400: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Bad request - invalid status payload',
    },
    401: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Unauthorized - authentication required',
    },
    404: {
      content: {
        'application/json': {
          schema: intakeValidations.notFoundResponseSchema,
        },
      },
      description: 'Intake not found',
    },
    500: {
      content: {
        'application/json': {
          schema: intakeValidations.internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

const convertIntakeRoute = routeBuilder.build({
  method: 'patch',
  path: '/{uuid}/convert',
  tags: ['Practice Client Intakes'],
  summary: 'Convert intake to matter',
  description: 'Converts a successful client intake into a formal matter.',
  mcp: {
    name: 'convert_intake_to_matter',
    scope: 'intakes:write',
    approval: {
      required: true,
      message: 'Convert this intake into a formal matter?',
      confirm_title: 'Convert intake',
    },
    handler: async (args, ctx) => {
      const { uuid, ...data } = args;
      return intakeLifecycleService.convertIntake(
        { uuid: uuid as string, data: data as Parameters<typeof intakeLifecycleService.convertIntake>[0]['data'] },
        ctx
      );
    },
  },
  request: {
    params: uuidParamOpenAPISchema,
    body: {
      content: {
        'application/json': {
          schema: intakeValidations.convertIntakeSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: intakeValidations.convertIntakeResponseSchema,
        },
      },
      description: 'Intake converted successfully.',
    },
    400: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Bad request - intake not eligible for conversion',
    },
    401: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Unauthorized - authentication required',
    },
    404: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Not Found - intake UUID does not exist',
    },
    409: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Conflict - intake already converted',
    },
    500: {
      content: {
        'application/json': {
          schema: intakeValidations.internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

export const staffRoutes = {
  triggerIntakeInvitationRoute,
  listIntakesRoute,
  getIntakeRoute,
  updateIntakeTriageStatusRoute,
  convertIntakeRoute,
};
