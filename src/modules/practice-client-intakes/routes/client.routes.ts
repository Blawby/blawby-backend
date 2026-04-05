import { uuidParamOpenAPISchema } from '@/modules/practice-client-intakes/routes/shared';
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

const claimPracticeClientIntakeRoute = routeBuilder.build({
  method: 'post',
  path: '/claim',
  tags: ['Practice Client Intakes'],
  summary: 'Claim paid intake',
  description: 'Links a paid intake to the authenticated user and ensures membership in the organization.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: intakeValidations.claimPracticeClientIntakeSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: intakeValidations.claimPracticeClientIntakeResponseSchema,
        },
      },
      description: 'Intake claimed successfully.',
    },
    400: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Bad request - missing session ID or intake not paid',
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
      description: 'Checkout session or intake not found',
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

const claimPracticeClientIntakeByUuidRoute = routeBuilder.build({
  method: 'post',
  path: '/{uuid}/claim',
  tags: ['Practice Client Intakes'],
  summary: 'Claim non-payment intake by UUID',
  description:
    'Links a non-payment (free) intake to the authenticated user and ensures membership in the organization.',
  request: {
    params: uuidParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: intakeValidations.claimPracticeClientIntakeResponseSchema,
        },
      },
      description: 'Intake claimed successfully.',
    },
    400: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Bad request - intake not eligible (status is not succeeded)',
    },
    403: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Forbidden - intake already claimed by another user',
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

export const clientRoutes = {
  updatePracticeClientIntakeRoute,
  getPracticeClientIntakeStatusRoute,
  createPracticeClientIntakeCheckoutSessionRoute,
  claimPracticeClientIntakeRoute,
  claimPracticeClientIntakeByUuidRoute,
};
