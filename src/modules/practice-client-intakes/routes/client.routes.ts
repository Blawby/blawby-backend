import { uuidParamOpenAPISchema } from '@/modules/practice-client-intakes/routes/shared';
import { intakeCheckoutService } from '@/modules/practice-client-intakes/services/intake-checkout.service';
import { intakeCreationService } from '@/modules/practice-client-intakes/services/intake-creation.service';
import { intakeValidations } from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';
import { routeBuilder } from '@/shared/router/route-builder';

const createPracticeClientIntakeCheckoutSessionRoute = routeBuilder.build({
  method: 'post',
  path: '/{uuid}/checkout-session',
  tags: ['Practice Client Intakes'],
  summary: 'Create Checkout Session for intake',
  description: 'Creates a Stripe Checkout Session for an existing intake.',
  request: {
    params: uuidParamOpenAPISchema,
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: intakeValidations.createPracticeClientIntakeCheckoutSessionResponseSchema,
        },
      },
      description: 'Checkout Session created successfully.',
    },
    400: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Bad request - intake not eligible for checkout session',
    },
    403: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Forbidden - connected account is not ready',
    },
    404: {
      content: {
        'application/json': {
          schema: intakeValidations.notFoundResponseSchema,
        },
      },
      description: 'Practice client intake not found',
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

const updatePracticeClientIntakeRoute = routeBuilder.build({
  method: 'put',
  path: '/{uuid}',
  tags: ['Practice Client Intakes'],
  summary: 'Update practice client intake',
  description: 'Updates practice client intake details in the database.',
  mcp: {
    name: 'update_intake',
    scope: 'intakes:write',
    handler: async (args, ctx) => {
      const { uuid, ...data } = args;
      return intakeCreationService.updateIntake(
        { uuid: uuid as string, data: data as Parameters<typeof intakeCreationService.updateIntake>[0]['data'] },
        ctx
      );
    },
  },
  request: {
    params: uuidParamOpenAPISchema,
    body: {
      content: {
        'application/json': {
          schema: intakeValidations.updatePracticeClientIntakeSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: intakeValidations.updatePracticeClientIntakeResponseSchema,
        },
      },
      description: 'Intake updated successfully.',
    },
    400: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Bad request - validation failed or payment already processed',
    },
    404: {
      content: {
        'application/json': {
          schema: intakeValidations.notFoundResponseSchema,
        },
      },
      description: 'Practice client intake not found',
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

const getPracticeClientIntakeStatusRoute = routeBuilder.build({
  method: 'get',
  path: '/{uuid}/status',
  tags: ['Practice Client Intakes'],
  summary: 'Get practice client intake status',
  description: 'Retrieves the current status of a practice client intake.',
  mcp: {
    name: 'get_intake_status',
    scope: 'intakes:read',
    handler: async (args, ctx) => intakeCheckoutService.getIntakeStatus({ uuid: args.uuid as string }, ctx),
  },
  request: {
    params: uuidParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: intakeValidations.practiceClientIntakeStatusResponseSchema,
        },
      },
      description: 'Status retrieved successfully.',
    },
    404: {
      content: {
        'application/json': {
          schema: intakeValidations.notFoundResponseSchema,
        },
      },
      description: 'Practice client intake not found',
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

export const clientRoutes = {
  updatePracticeClientIntakeRoute,
  getPracticeClientIntakeStatusRoute,
  createPracticeClientIntakeCheckoutSessionRoute,
};
