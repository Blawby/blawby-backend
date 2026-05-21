import { createRoute } from '@hono/zod-openapi';
import {
  errorResponseSchema,
  notFoundResponseSchema,
  internalServerErrorResponseSchema,
} from '@/shared/validations/openapi';

type RouteConfig = Parameters<typeof createRoute>[0];
type Responses = RouteConfig['responses'];

/**
 * Enhanced Route Builder to reduce OpenAPI boilerplate
 */
export const routeBuilder = {
  /**
   * Build an OpenAPI route with standard error responses
   *
   * @param config - Route configuration
   * @returns Hono route object
   */
  build: <P extends string, R extends RouteConfig & { path: P }>(config: R) => {
    // Standard error responses (400, 401, 403, 404, 500)
    const standardResponses: Responses = {
      400: {
        description: 'Bad Request',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      403: {
        description: 'Forbidden',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      404: {
        description: 'Not Found',
        content: {
          'application/json': {
            schema: notFoundResponseSchema,
          },
        },
      },
      500: {
        description: 'Internal Server Error',
        content: {
          'application/json': {
            schema: internalServerErrorResponseSchema,
          },
        },
      },
    };

    // Merge standard responses with configuration (config takes precedence)
    const responses: Responses = {
      ...standardResponses,
      ...config.responses,
    };

    return createRoute({
      ...config,
      responses,
    });
  },
};
