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
  description: 'Update preferences for a specific category. The request body schema varies by category. Supports partial updates - only include fields you want to change. For notifications category, system_push and system_email are always set to true regardless of input.',
  security: [{ Bearer: [] }],
  request: {
    params: categoryParamOpenAPISchema,
    body: {
      content: {
        'application/json': {
          schema: notificationPreferencesSchema.openapi({
            description: 'Category-specific preferences data. Schema depends on the category parameter. Example shown is for notifications category. Supports partial updates - only include fields you want to change. Note: For notifications category, system_push and system_email are always set to true regardless of input.',
            example: {
              messages_push: true,
              messages_email: true,
              messages_mentions_only: false,
              payments_push: true,
              payments_email: true,
              intakes_push: true,
              intakes_email: true,
              matters_push: true,
              matters_email: true,
              desktop_push_enabled: false,
            },
          }),
        },
      },
      description: 'Category-specific preferences data. Schema varies by category. For notifications: system_push and system_email are always true.',
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

