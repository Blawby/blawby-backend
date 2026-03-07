import { createRoute } from '@hono/zod-openapi';


import { uuidParamOpenAPISchema } from '@/modules/practice-client-intakes/routes/creation.routes';
import { intakeValidations } from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';
import { routeBuilder } from '@/shared/router/route-builder';

/**
 * POST /api/practice/client-intakes/:uuid/checkout-session
 * Creates a Stripe Checkout Session for an existing intake
 */
export const createPracticeClientIntakeCheckoutSessionRoute = routeBuilder.build(createRoute({
  method: 'post',
  path: '/{uuid}/checkout-session',
  tags: ['Practice Client Intakes'],
  summary: 'Create Checkout Session for intake',
  description: 'Creates a Stripe Checkout Session for an existing intake. Returns a Checkout Session URL for redirecting the client to Stripe-hosted checkout. The session includes metadata for intake association and supports destination charges on the connected account.',
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
      description: 'Checkout Session created successfully. Returns the Stripe Checkout Session URL and session ID.',
    },
    400: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Bad request - intake not eligible for checkout session',
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
}));

/**
 * GET /api/practice/client-intakes/:uuid/status
 * Gets payment status
 */
export const getPracticeClientIntakeStatusRoute = routeBuilder.build(createRoute({
  method: 'get',
  path: '/{uuid}/status',
  tags: ['Practice Client Intakes'],
  summary: 'Get practice client intake status',
  description: 'Retrieves the current status of a practice client intake, including payment details, client metadata, triage fields, and timestamps. The UUID is obtained from the create endpoint response. Status values: `open` (awaiting payment), `succeeded` (payment complete or direct success), `expired`, `canceled`, `failed`, `converted`.',
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
      description: 'Status retrieved successfully. Returns the intake UUID, payment amount, currency, current status, Stripe charge ID (if payment succeeded), client metadata (email, name, phone, case details), and timestamps (succeeded_at, created_at).',
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
}));

/**
 * GET /api/practice/client-intakes/post-pay/status
 * Gets post-pay status by Checkout Session ID
 */
export const getPracticeClientIntakePostPayStatusRoute = routeBuilder.build(createRoute({
  method: 'get',
  path: '/post-pay/status',
  tags: ['Practice Client Intakes'],
  summary: 'Get intake status by Checkout Session ID',
  description: 'Retrieves post-pay status using a Stripe Checkout Session ID. Used by clients returning from Stripe with a session_id parameter.',
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
      description: 'Post-pay status retrieved. Returns paid flag and intake identifiers when available.',
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
}));
