import type { McpToolApproval } from '@/modules/mcp/types';
import type { ServiceContext } from '@/shared/types/service-context';
import {
  errorResponseSchema,
  internalServerErrorResponseSchema,
  notFoundResponseSchema,
} from '@/shared/validations/openapi';
import { createRoute } from '@hono/zod-openapi';
// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- `ZodRawShape` is Zod's built-in type name, not a renameable local symbol.
import type { ZodRawShape } from 'zod';

type RouteConfig = Parameters<typeof createRoute>[0];
type Responses = RouteConfig['responses'];

interface McpRouteAnnotation {
  scope: string;
  name?: string;
  description?: string;
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- `ZodRawShape` is Zod's built-in type name, not a renameable local symbol.
  schema?: ZodRawShape;
  approval?: McpToolApproval;
  /**
   * An MCP tool's `args`/return shape is genuinely per-tool — this annotation type is shared by
   * every tool registered through `routeBuilder.build`, so it cannot name one concrete domain
   * type here without conflicting with the others.
   */
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type,anti-slop/no-unknown-returns
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
    config: R & { excludeDefaultResponses?: readonly (400 | 401 | 403 | 404 | 500)[] }
  ) => {
    const { mcp, excludeDefaultResponses, ...routeConfig } = config;

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

    /**
     * A caller whose error contract never produces one of these codes (e.g. the KrabiClaw facade,
     * which reserializes every failure into its own reviewed 4xx/5xx set and never returns a bare
     * `500`) can exclude it here — otherwise it would survive into the OpenAPI document as an
     * unreachable response the route can never actually produce.
     */
    for (const code of excludeDefaultResponses ?? []) {
      delete standardResponses[code];
    }

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
      // SAFETY: `Object.assign` just attached the `mcp` property checked non-undefined on the line above, so the runtime shape genuinely matches `WithMcp`.
      return Object.assign(route, { mcp }) as typeof route & WithMcp;
    }

    // SAFETY: this branch only runs when `mcp` is undefined, so `route` genuinely carries no `mcp` property — `WithoutMcp`'s `Record<string, never>` accurately describes that absence.
    return route as typeof route & WithoutMcp;
  },
};

export type { McpRouteAnnotation };
