import type { OpenAPIHono, RouteConfig } from '@hono/zod-openapi';
import type { Env } from 'hono';

type RouteCollection = Record<string, unknown> | RouteConfig[];

export const isRouteConfig = (value: unknown): value is RouteConfig =>
  typeof value === 'object' &&
  value !== null &&
  'method' in value &&
  'path' in value &&
  'responses' in value &&
  value !== null &&
  'method' in value &&
  'path' in value &&
  'responses' in value;

export const registerOpenApiRoutes = <E extends Env>(app: OpenAPIHono<E>, routes: RouteCollection): void => {
  const routeValues = Array.isArray(routes) ? routes : Object.values(routes);

  for (const route of routeValues) {
    if (isRouteConfig(route)) {
      app.openAPIRegistry.registerPath(route);
    }
  }
};
