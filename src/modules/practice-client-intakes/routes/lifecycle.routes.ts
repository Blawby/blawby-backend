import { createRoute, z } from '@hono/zod-openapi';


import { uuidParamOpenAPISchema } from '@/modules/practice-client-intakes/routes/creation.routes';
import { intakeValidations } from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';
import { routeBuilder } from '@/shared/router/route-builder';

/**
 * POST /api/practice/client-intakes/claim
 * Claims a paid intake for the authenticated user
 */
export const claimPracticeClientIntakeRoute = routeBuilder.build(createRoute({
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
}));

/**
 * POST /api/practice/client-intakes/:uuid/invite
 * Triggers an invitation for the user associated with this intake
 */
export const triggerIntakeInvitationRoute = routeBuilder.build(createRoute({
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
}));

/**
 * GET /api/practice/{practice_id}/client-intakes
 * List practice client intakes (legal staff only)
 */
export const listIntakesRoute = routeBuilder.build(createRoute({
  method: 'get',
  path: '/{practice_id}',
  tags: ['Practice Client Intakes'],
  summary: 'List practice client intakes or get by ID',
  description: 'Retrieves a paginated list of client intakes for a specific practice. Includes filtering by status, search (name/email/opposing party), and date range. Use the `intake_id` query parameter to retrieve a specific intake.',
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
}));

/**
 * PATCH /api/practice/client-intakes/{uuid}/status
 * Updates intake triage status independently from payment/conversion status
 */
export const updateIntakeTriageStatusRoute = routeBuilder.build(createRoute({
  method: 'patch',
  path: '/{uuid}/status',
  tags: ['Practice Client Intakes'],
  summary: 'Update intake triage status',
  description: 'Sets practice triage decision for an intake (`accepted` or `declined`) without converting it to a matter. Declined intakes can include a reason for audit purposes.',
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
}));

/**
 * PATCH /api/practice/client-intakes/{uuid}/convert
 * Converts a successful intake to a Matter
 */
export const convertIntakeRoute = routeBuilder.build(createRoute({
  method: 'patch',
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
    201: {
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
}));
