import { createRoute, z } from '@hono/zod-openapi';

import { intakeValidations } from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';
import { routeBuilder } from '@/shared/router/route-builder';


export const slugParamOpenAPISchema = z.object({
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

export const uuidParamOpenAPISchema = z.object({
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
export const getIntakeSettingsRoute = routeBuilder.build(createRoute({
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
}));

/**
 * POST /api/practice/client-intakes/create
 * Creates a Stripe Payment Link for practice client intake
 */
export const createPracticeClientIntakeRoute = routeBuilder.build(createRoute({
  method: 'post',
  path: '/create',
  tags: ['Practice Client Intakes'],
  summary: 'Create practice client intake',
  description: 'Creates a practice client intake. Payment flow is determined by organization settings: if payment is required, a Stripe Payment Link is created and returned; otherwise the intake is created directly as succeeded with no Stripe redirect.',
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
      description: 'Practice client intake created successfully. Returns intake UUID, amount, currency, status, and organization branding. `payment_link_url` is present when Stripe checkout is required; otherwise it may be null.',
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
}));

/**
 * PUT /api/practice/client-intakes/:uuid
 * Updates payment amount by creating a new Payment Link
 */
export const updatePracticeClientIntakeRoute = routeBuilder.build(createRoute({
  method: 'put',
  path: '/{uuid}',
  tags: ['Practice Client Intakes'],
  summary: 'Update practice client intake',
  description: 'Updates practice client intake details in the database. Can update fields for case triage such as urgency, desired outcome, court date, etc. Returns success status.',
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
}));
