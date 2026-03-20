import { slugParamOpenAPISchema } from '@/modules/practice-client-intakes/routes/shared';
import { intakeValidations } from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';
import { routeBuilder } from '@/shared/router/route-builder';

const getIntakeSettingsRoute = routeBuilder.build({
  method: 'get',
  path: '/{slug}/intake',
  tags: ['Practice Client Intakes'],
  summary: 'Get intake settings',
  description: 'Public endpoint to retrieve organization details and payment settings for a practice intake form.',
  request: {
    params: slugParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: intakeValidations.practiceClientIntakeSettingsResponseSchema,
        },
      },
      description: 'Intake settings retrieved successfully.',
    },
    404: {
      content: {
        'application/json': {
          schema: intakeValidations.notFoundResponseSchema,
        },
      },
      description: 'Organization not found',
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

const createPracticeClientIntakeRoute = routeBuilder.build({
  method: 'post',
  path: '/create',
  tags: ['Practice Client Intakes'],
  summary: 'Create practice client intake',
  description: 'Creates a practice client intake and optional Stripe payment flow.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: intakeValidations.createPracticeClientIntakeSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: intakeValidations.createPracticeClientIntakeResponseSchema,
        },
      },
      description: 'Practice client intake created successfully.',
    },
    400: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Bad request - validation failed',
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

const getPracticeClientIntakePostPayStatusRoute = routeBuilder.build({
  method: 'get',
  path: '/post-pay/status',
  tags: ['Practice Client Intakes'],
  summary: 'Get intake status by Checkout Session ID',
  description: 'Retrieves post-pay status using a Stripe Checkout Session ID.',
  request: {
    query: intakeValidations.checkoutSessionStatusQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: intakeValidations.practiceClientIntakePostPayStatusResponseSchema,
        },
      },
      description: 'Post-pay status retrieved.',
    },
    404: {
      content: {
        'application/json': {
          schema: intakeValidations.notFoundResponseSchema,
        },
      },
      description: 'Checkout session not found or not associated with an intake',
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

export const publicRoutes = {
  getIntakeSettingsRoute,
  createPracticeClientIntakeRoute,
  getPracticeClientIntakePostPayStatusRoute,
};
