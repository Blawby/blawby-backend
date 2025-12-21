import { createRoute, z } from '@hono/zod-openapi';

import {
  createPracticeSchema,
  updatePracticeSchema,
  practiceListResponseSchema,
  practiceSingleResponseSchema,
  setActivePracticeResponseSchema,
  errorResponseSchema,
  notFoundResponseSchema,
  internalServerErrorResponseSchema,
  membersListResponseSchema,
  updateMemberRoleSchema,
  invitationsListResponseSchema,
  createInvitationSchema,
  acceptInvitationResponseSchema,
  createPracticeDetailsSchema,
  updatePracticeDetailsSchema,
  practiceDetailsSingleResponseSchema,
  practiceDetailsCreateResponseSchema,
  practiceDetailsUpdateResponseSchema,
} from '@/modules/practice/validations/practice.validation';

/**
 * OpenAPI param schema with metadata
 */
const practiceUuidParamOpenAPISchema = z.object({
  uuid: z
    .string()
    .uuid()
    .openapi({
      param: {
        name: 'uuid',
        in: 'path',
      },
      description: 'Practice/Organization ID (UUID)',
      example: '123e4567-e89b-12d3-a456-426614174000',
    }),
});

/**
 * GET /api/practice/list
 * List all practices for the authenticated user
 */
export const listPracticesRoute = createRoute({
  method: 'get',
  path: '/list',
  tags: ['Practice'],
  summary: 'List practices',
  description: 'Retrieve all practices for the authenticated user',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceListResponseSchema,
        },
      },
      description: 'Practices retrieved successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request',
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
 * POST /api/practice
 * Create a new practice
 */
export const createPracticeRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Practice'],
  summary: 'Create practice',
  description: 'Create a new practice (organization with optional practice details)',
  request: {
    body: {
      content: {
        'application/json': {
          schema: createPracticeSchema,
        },
      },
      description: 'Practice creation data',
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: practiceSingleResponseSchema,
        },
      },
      description: 'Practice created successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request data',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Failed to create practice',
    },
  },
});

/**
 * GET /api/practice/:uuid
 * Get practice by ID
 */
export const getPracticeByIdRoute = createRoute({
  method: 'get',
  path: '/{uuid}',
  tags: ['Practice'],
  summary: 'Get practice by ID',
  description: 'Retrieve a specific practice by its UUID',
  request: {
    params: practiceUuidParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceSingleResponseSchema,
        },
      },
      description: 'Practice retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Practice not found',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request parameters',
    },
  },
});

/**
 * PUT /api/practice/:uuid
 * Update practice
 */
export const updatePracticeRoute = createRoute({
  method: 'put',
  path: '/{uuid}',
  tags: ['Practice'],
  summary: 'Update practice',
  description: 'Update an existing practice',
  request: {
    params: practiceUuidParamOpenAPISchema,
    body: {
      content: {
        'application/json': {
          schema: updatePracticeSchema,
        },
      },
      description: 'Practice update data',
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceSingleResponseSchema,
        },
      },
      description: 'Practice updated successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Practice not found',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request data',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Failed to update practice',
    },
  },
});

/**
 * DELETE /api/practice/:uuid
 * Delete practice
 */
export const deletePracticeRoute = createRoute({
  method: 'delete',
  path: '/{uuid}',
  tags: ['Practice'],
  summary: 'Delete practice',
  description: 'Delete a practice by its UUID',
  request: {
    params: practiceUuidParamOpenAPISchema,
  },
  responses: {
    204: {
      description: 'Practice deleted successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Practice not found',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request parameters',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Failed to delete practice',
    },
  },
});

/**
 * PUT /api/practice/:uuid/active
 * Set practice as active
 */
export const setActivePracticeRoute = createRoute({
  method: 'put',
  path: '/{uuid}/active',
  tags: ['Practice'],
  summary: 'Set active practice',
  description: 'Set a practice as the active practice for the authenticated user',
  request: {
    params: practiceUuidParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: setActivePracticeResponseSchema,
        },
      },
      description: 'Practice set as active successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Practice not found',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request parameters',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Failed to set active practice',
    },
  },
});

// Member routes

/**
 * GET /api/practice/:uuid/members
 * List all members of an organization
 */
export const listMembersRoute = createRoute({
  method: 'get',
  path: '/{uuid}/members',
  tags: ['Practice'],
  summary: 'List practice members',
  description: 'Retrieve all members of a practice',
  request: {
    params: practiceUuidParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: membersListResponseSchema,
        },
      },
      description: 'Members retrieved successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request',
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
 * PATCH /api/practice/:uuid/members
 * Update a member's role
 */
export const updateMemberRoleRoute = createRoute({
  method: 'patch',
  path: '/{uuid}/members',
  tags: ['Practice'],
  summary: 'Update member role',
  description: 'Update a member\'s role in a practice',
  request: {
    params: practiceUuidParamOpenAPISchema,
    body: {
      content: {
        'application/json': {
          schema: updateMemberRoleSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
          }),
        },
      },
      description: 'Member role updated successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request',
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
 * DELETE /api/practice/:uuid/members/:userId
 * Remove a member from an organization
 */
const userIdParamSchema = z.object({
  uuid: z.string().uuid(), // Organization ID (UUID)
  userId: z.string().uuid(), // User ID (UUID)
});

export const removeMemberRoute = createRoute({
  method: 'delete',
  path: '/{uuid}/members/{userId}',
  tags: ['Practice'],
  summary: 'Remove member',
  description: 'Remove a member from a practice',
  request: {
    params: userIdParamSchema,
  },
  responses: {
    204: {
      description: 'Member removed successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request',
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

// Invitation routes

/**
 * GET /api/practice/invitations
 * List all pending invitations for the current user
 */
export const listInvitationsRoute = createRoute({
  method: 'get',
  path: '/invitations',
  tags: ['Practice'],
  summary: 'List invitations',
  description: 'Retrieve all pending invitations for the authenticated user',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: invitationsListResponseSchema,
        },
      },
      description: 'Invitations retrieved successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request',
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
 * POST /api/practice/:uuid/invitations
 * Create a new invitation for an organization
 */
export const createInvitationRoute = createRoute({
  method: 'post',
  path: '/{uuid}/invitations',
  tags: ['Practice'],
  summary: 'Create invitation',
  description: 'Create a new invitation for a practice',
  request: {
    params: practiceUuidParamOpenAPISchema,
    body: {
      content: {
        'application/json': {
          schema: createInvitationSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean().openapi({
              description: 'Whether the invitation was created successfully',
              example: true,
            }),
            invitation_id: z.string().uuid().openapi({
              description: 'ID of the created invitation (UUID)',
              example: '123e4567-e89b-12d3-a456-426614174000',
            }),
          }),
        },
      },
      description: 'Invitation created successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request',
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
 * POST /api/practice/invitations/:invitationId/accept
 * Accept a pending invitation
 */
const invitationIdParamSchema = z.object({
  invitationId: z.string(),
});

export const acceptInvitationRoute = createRoute({
  method: 'post',
  path: '/invitations/{invitationId}/accept',
  tags: ['Practice'],
  summary: 'Accept invitation',
  description: 'Accept a pending invitation',
  request: {
    params: invitationIdParamSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: acceptInvitationResponseSchema,
        },
      },
      description: 'Invitation accepted successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request',
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
 * POST /api/practice/invitations/:invitationId/decline
 * Decline a pending invitation
 */
export const declineInvitationRoute = createRoute({
  method: 'post',
  path: '/invitations/{invitationId}/decline',
  tags: ['Practice'],
  summary: 'Decline invitation',
  description: 'Decline a pending invitation',
  request: {
    params: invitationIdParamSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
          }),
        },
      },
      description: 'Invitation declined successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request',
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

// Practice Details Routes

/**
 * GET /api/practice/:uuid/details
 * Get practice details
 */
export const getPracticeDetailsRoute = createRoute({
  method: 'get',
  path: '/{uuid}/details',
  tags: ['Practice'],
  summary: 'Get practice details',
  description: 'Retrieve practice details for a specific practice',
  request: {
    params: practiceUuidParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceDetailsSingleResponseSchema,
        },
      },
      description: 'Practice details retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Practice not found',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request parameters',
    },
  },
});

/**
 * POST /api/practice/:uuid/details
 * Create practice details
 */
export const createPracticeDetailsRoute = createRoute({
  method: 'post',
  path: '/{uuid}/details',
  tags: ['Practice'],
  summary: 'Create practice details',
  description: 'Create practice details for a practice',
  request: {
    params: practiceUuidParamOpenAPISchema,
    body: {
      content: {
        'application/json': {
          schema: createPracticeDetailsSchema,
        },
      },
      description: 'Practice details data',
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: practiceDetailsCreateResponseSchema,
        },
      },
      description: 'Practice details created successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request data or practice details already exist',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Practice not found',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Failed to create practice details',
    },
  },
});

/**
 * PUT /api/practice/:uuid/details
 * Update practice details
 */
export const updatePracticeDetailsRoute = createRoute({
  method: 'put',
  path: '/{uuid}/details',
  tags: ['Practice'],
  summary: 'Update practice details',
  description: 'Update practice details for a practice (creates if doesn\'t exist)',
  request: {
    params: practiceUuidParamOpenAPISchema,
    body: {
      content: {
        'application/json': {
          schema: updatePracticeDetailsSchema,
        },
      },
      description: 'Practice details update data',
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceDetailsUpdateResponseSchema,
        },
      },
      description: 'Practice details updated successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Practice not found',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request data',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Failed to update practice details',
    },
  },
});

/**
 * DELETE /api/practice/:uuid/details
 * Delete practice details
 */
export const deletePracticeDetailsRoute = createRoute({
  method: 'delete',
  path: '/{uuid}/details',
  tags: ['Practice'],
  summary: 'Delete practice details',
  description: 'Delete practice details for a practice',
  request: {
    params: practiceUuidParamOpenAPISchema,
  },
  responses: {
    204: {
      description: 'Practice details deleted successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Practice not found',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request parameters',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Failed to delete practice details',
    },
  },
});

