import type { McpToolApproval } from '@/modules/mcp/types';
import type { ServiceContext } from '@/shared/types/service-context';
import {
  errorResponseSchema,
  internalServerErrorResponseSchema,
  notFoundResponseSchema,
} from '@/shared/validations/openapi';
import { createRoute } from '@hono/zod-openapi';
import type { ZodRawShape } from 'zod';

type RouteConfig = Parameters<typeof createRoute>[0];
type Responses = RouteConfig['responses'];

interface McpRouteAnnotation {
  scope: string;
  name?: string;
  description?: string;
  schema?: ZodRawShape;
  /** Synchronous in-session confirm via the MCP client's own elicitation UI (e.g. Claude Desktop). */
  approval?: McpToolApproval;
  /**
   * Async approval instead: the tool call stages a `pending_actions` row and
   * returns an approval URL rather than executing immediately. Use for
   * writes that need a durable audit trail or may be approved by someone
   * other than whoever is driving the MCP session (e.g. financial writes).
   * Orthogonal to `approval` — a tool should use one or the other, not both.
   */
  requiresPendingApproval?: boolean;
  handler: (args: Record<string, unknown>, ctx: ServiceContext) => Promise<unknown>;
}

// Mapped type prevents oxfmt from converting to interface; interface WithMcp breaks RouteConfig's x-${string} index signature constraint
type WithMcp = Record<'mcp', McpRouteAnnotation>;
type WithoutMcp = Record<string, never>;

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
  build: <P extends string, M extends McpRouteAnnotation | undefined, R extends RouteConfig & { path: P; mcp?: M }>(
    config: R
  ) => {
    const { mcp, ...routeConfig } = config;

    if (mcp?.approval && mcp.requiresPendingApproval) {
      throw new Error('MCP routes must choose synchronous approval or pending approval, not both');
    }

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
      ...routeConfig.responses,
    };

    const route = createRoute({
      ...routeConfig,
      responses,
    });

    if (mcp !== undefined) {
      return Object.assign(route, { mcp }) as typeof route & WithMcp;
    }

    return route as typeof route & WithoutMcp;
  },
};

export type { McpRouteAnnotation };
