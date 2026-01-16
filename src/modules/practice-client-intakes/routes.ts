import { createRoute, z } from '@hono/zod-openapi';

import {
  createPracticeClientIntakeSchema,
  updatePracticeClientIntakeSchema,
  practiceClientIntakeSettingsResponseSchema,
  createPracticeClientIntakeResponseSchema,
  updatePracticeClientIntakeResponseSchema,
  practiceClientIntakeStatusResponseSchema,
  errorResponseSchema,
  notFoundResponseSchema,
  internalServerErrorResponseSchema,
} from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';

/**
 * OpenAPI param schemas with metadata
 */
const slugParamOpenAPISchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .openapi({
      param: {
        name: 'slug',
        in: 'path',
      },
      description: 'Organization slug',
      example: 'my-practice',
    }),
});

const uuidParamOpenAPISchema = z.object({
  uuid: z
    .string()
    .uuid()
    .openapi({
      param: {
        name: 'uuid',
        in: 'path',
      },
      description: 'Practice client intake UUID (returned when creating an intake, used to identify the specific intake)',
      example: '123e4567-e89b-12d3-a456-426614174000',
    }),
});

/**
 * GET /api/practice/client-intakes/:slug/intake
 * Public intake page - returns organization details and payment settings
 */
export const getIntakeSettingsRoute = createRoute({
  method: 'get',
  path: '/{slug}/intake',
  tags: ['Practice Client Intakes'],
  summary: 'Get intake settings',
  description: 'Public endpoint to retrieve organization details and payment settings for a practice\'s client intake form. Returns organization branding (name, logo), payment settings (enabled status, prefill amount), and connected account status. Used by frontend to display the intake form with proper branding.',
  request: {
    params: slugParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceClientIntakeSettingsResponseSchema,
        },
      },
      description: 'Intake settings retrieved successfully. Returns organization details (id, name, slug, logo), payment settings (paymentLinkEnabled, prefillAmount), and connected account status (id, chargesEnabled).',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Organization not found',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

/**
 * POST /api/practice/client-intakes/create
 * Creates a Stripe Payment Link for practice client intake
 */
export const createPracticeClientIntakeRoute = createRoute({
  method: 'post',
  path: '/create',
  tags: ['Practice Client Intakes'],
  summary: 'Create practice client intake',
  description: 'Creates a Stripe Payment Link for a practice client intake. The client is redirected to the returned `payment_link_url` to complete payment on Stripe\'s hosted payment page. All endpoints are public (no authentication required).',
  request: {
    body: {
      content: {
        'application/json': {
          schema: createPracticeClientIntakeSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: createPracticeClientIntakeResponseSchema,
        },
      },
      description: 'Practice client intake created successfully. Returns the intake UUID, Stripe Payment Link URL (for client redirect), payment amount, currency, status, and organization branding. The `payment_link_url` should be used to redirect the client to Stripe\'s hosted payment page.',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Bad request - validation failed',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

/**
 * PUT /api/practice/client-intakes/:uuid
 * Updates payment amount by creating a new Payment Link
 */
export const updatePracticeClientIntakeRoute = createRoute({
  method: 'put',
  path: '/{uuid}',
  tags: ['Practice Client Intakes'],
  summary: 'Update practice client intake',
  description: 'Updates the payment amount for a practice client intake by creating a new Stripe Payment Link and deactivating the old one. The UUID is obtained from the create endpoint response. Only works if the payment has not been completed or expired. Returns a new `payment_link_url` for the client to complete payment with the updated amount.',
  request: {
    params: uuidParamOpenAPISchema,
    body: {
      content: {
        'application/json': {
          schema: updatePracticeClientIntakeSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: updatePracticeClientIntakeResponseSchema,
        },
      },
      description: 'Practice client intake updated successfully. Returns the intake UUID, new Stripe Payment Link URL (old link is deactivated), updated payment amount, currency, and status. The new `payment_link_url` should be used to redirect the client to Stripe\'s hosted payment page with the updated amount.',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Bad request - validation failed or payment already processed',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Practice client intake not found',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

/**
 * GET /api/practice/client-intakes/:uuid/status
 * Gets payment status
 */
export const getPracticeClientIntakeStatusRoute = createRoute({
  method: 'get',
  path: '/{uuid}/status',
  tags: ['Practice Client Intakes'],
  summary: 'Get practice client intake status',
  description: 'Retrieves the current status of a practice client intake payment, including payment details, client metadata, and timestamps. The UUID is obtained from the create endpoint response. Status values: `open` (awaiting payment), `completed`/`succeeded` (payment successful), `expired` (Payment Link expired), `canceled` (payment canceled), `failed` (payment failed). Used by frontend to poll for payment completion after redirecting client to Stripe\'s hosted payment page.',
  request: {
    params: uuidParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceClientIntakeStatusResponseSchema,
        },
      },
      description: 'Status retrieved successfully. Returns the intake UUID, payment amount, currency, current status, Stripe charge ID (if payment succeeded), client metadata (email, name, phone, case details), and timestamps (succeeded_at, created_at).',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Practice client intake not found',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});


