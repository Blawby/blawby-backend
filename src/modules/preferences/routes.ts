import { createRoute, z } from '@hono/zod-openapi';

import {
  generalPreferencesSchema,
  notificationPreferencesSchema,
  securityPreferencesSchema,
  accountPreferencesSchema,
  onboardingPreferencesSchema,
  profilePreferencesSchema,
  preferencesResponseSchema,
  categoryPreferencesResponseSchema,
  errorResponseSchema,
  notFoundResponseSchema,
  internalServerErrorResponseSchema,
} from './validations/preferences.validation';

/**
 * OpenAPI param schema for category
 */
const categoryParamOpenAPISchema = z.object({
  category: z
    .enum(['general', 'notifications', 'security', 'account', 'onboarding', 'profile'])
    .openapi({
      param: {
        name: 'category',
        in: 'path',
      },
      description: 'Preference category',
      example: 'general',
    }),
});

/**
 * GET /api/preferences
 * Get all preferences for the authenticated user
 */
export const getAllPreferencesRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Preferences'],
  summary: 'Get all preferences',
  description: 'Retrieve all preferences for the authenticated user',
  security: [{ Bearer: [] }],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: preferencesResponseSchema,
        },
      },
      description: 'Preferences retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Preferences not found',
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
 * GET /api/preferences/:category
 * Get preferences by category
 */
export const getCategoryPreferencesRoute = createRoute({
  method: 'get',
  path: '/{category}',
  tags: ['Preferences'],
  summary: 'Get preferences by category',
  description: 'Retrieve preferences for a specific category (general, notifications, security, account, onboarding, profile)',
  security: [{ Bearer: [] }],
  request: {
    params: categoryParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: categoryPreferencesResponseSchema,
        },
      },
      description: 'Category preferences retrieved successfully',
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
 * PUT /api/preferences/:category
 * Update preferences by category
 */
export const updateCategoryPreferencesRoute = createRoute({
  method: 'put',
  path: '/{category}',
  tags: ['Preferences'],
  summary: 'Update preferences by category',
  description: 'Update preferences for a specific category. The request body schema varies by category.',
  security: [{ Bearer: [] }],
  request: {
    params: categoryParamOpenAPISchema,
    body: {
      content: {
        'application/json': {
          schema: z.record(z.string(), z.unknown()),
        },
      },
      description: 'Category-specific preferences data. Schema varies by category.',
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: categoryPreferencesResponseSchema,
        },
      },
      description: 'Preferences updated successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid category or request data',
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
 * GET /api/preferences/me
 * Get all preferences (legacy endpoint)
 */
export const getPreferencesMeRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['Preferences'],
  summary: 'Get all preferences (legacy)',
  description: 'Legacy endpoint for retrieving all preferences. Use GET /api/preferences instead.',
  security: [{ Bearer: [] }],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: preferencesResponseSchema,
        },
      },
      description: 'Preferences retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Preferences not found',
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
 * PUT /api/preferences/me
 * Update profile preferences (legacy endpoint)
 */
export const updatePreferencesMeRoute = createRoute({
  method: 'put',
  path: '/me',
  tags: ['Preferences'],
  summary: 'Update profile preferences (legacy)',
  description: 'Legacy endpoint for updating profile preferences. Use PUT /api/preferences/profile instead.',
  security: [{ Bearer: [] }],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: categoryPreferencesResponseSchema,
        },
      },
      description: 'Preferences updated successfully',
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
      description: 'Internal server error',
    },
  },
});

