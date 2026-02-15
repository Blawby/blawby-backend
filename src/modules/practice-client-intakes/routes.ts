import { createRoute, z } from '@hono/zod-openapi';

import {
  intakeValidations,
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
          schema: intakeValidations.practiceClientIntakeSettingsResponseSchema,
        },
      },
      description: 'Intake settings retrieved successfully. Returns organization details (id, name, slug, logo), payment settings (paymentLinkEnabled, prefillAmount), and connected account status (id, chargesEnabled).',
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

/**
 * POST /api/practice/client-intakes/:uuid/checkout-session
 * Creates a Stripe Checkout Session for an existing intake
 */
export const createPracticeClientIntakeCheckoutSessionRoute = createRoute({
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
      description: 'Practice client intake created successfully. Returns the intake UUID, Stripe Payment Link URL (for client redirect), payment amount, currency, status, and organization branding. The `payment_link_url` should be used to redirect the client to Stripe\'s hosted payment page.',
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
      description: 'Practice client intake updated successfully. Returns the intake UUID, new Stripe Payment Link URL (old link is deactivated), updated payment amount, currency, and status. The new `payment_link_url` should be used to redirect the client to Stripe\'s hosted payment page with the updated amount.',
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
});

/**
 * GET /api/practice/client-intakes/post-pay/status
 * Gets post-pay status by Checkout Session ID
 */
export const getPracticeClientIntakePostPayStatusRoute = createRoute({
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
});

/**
 * POST /api/practice/client-intakes/claim
 * Claims a paid intake for the authenticated user
 */
export const claimPracticeClientIntakeRoute = createRoute({
  method: 'post',
  path: '/claim',
  tags: ['Practice Client Intakes'],
  summary: 'Claim paid intake',
  description: 'Links a paid intake (identified by Checkout Session ID) to the authenticated user and ensures membership in the organization.',
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

/**
 * POST /api/practice/client-intakes/:uuid/invite
 * Triggers an invitation for the user associated with this intake
 */
export const triggerIntakeInvitationRoute = createRoute({
  method: 'post',
  path: '/{uuid}/invite',
  tags: ['Practice Client Intakes'],
  summary: 'Trigger intake invitation',
  description: 'Triggers a manual organization invitation for the client associated with a successful intake. This is used by legal staff to explicitly invite a client to the practice workspace after they have completed the intake payment. Requires authentication. The invitation process creates a link between the client\'s intake data and their (potentially new) user account.',
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
      description: 'Invitation triggered successfully. An email will be sent to the client with a link to accept the invitation and join the practice workspace.',
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

/**
 * GET /api/practice/{practice_id}/client-intakes
 * List practice client intakes (legal staff only)
 */
export const listIntakesRoute = createRoute({
  method: 'get',
  path: '/{practice_id}/client-intakes',
  tags: ['Practice Client Intakes'],
  summary: 'List practice client intakes',
  description: 'Retrieves a paginated list of client intakes for a specific practice. Includes filtering by status, search (name/email/opposing party), and date range. Privacy-sensitive fields (income, household_size) are excluded from this response.',
  request: {
    params: z.object({
      practice_id: z.uuid().openapi({
        param: { name: 'practice_id', in: 'path' },
        description: 'Practice organization ID',
      }),
    }),
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

/**
 * POST /api/practice/client-intakes/{uuid}/convert
 * Converts a successful intake to a Matter
 */
export const convertIntakeRoute = createRoute({
  method: 'post',
  path: '/{uuid}/convert',
  tags: ['Practice Client Intakes'],
  summary: 'Convert intake to matter',
  description: 'Converts a successful (paid) client intake into a formal Matter. Copies metadata (title, client info, case details) and links the intake and any associated conversation to the new Matter. Idempotent: returns error if already converted.',
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
    200: {
      content: {
        'application/json': {
          schema: intakeValidations.convertIntakeResponseSchema,
        },
      },
      description: 'Intake converted successfully. Returns the new Matter ID.',
    },
    400: {
      content: {
        'application/json': {
          schema: intakeValidations.errorResponseSchema,
        },
      },
      description: 'Bad request - intake not eligible for conversion',
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
