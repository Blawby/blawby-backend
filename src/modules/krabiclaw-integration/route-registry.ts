import type { KrabiClawFacadeRouteDefinition } from '@/modules/krabiclaw-integration/types/route-policy.types';

/**
 * The one authoritative facade route registry (KTD2). Every route this
 * facade will ever expose is declared here exactly once, with its
 * immutable method/path/scope/actor-kind/rate-family/rollout-group/
 * request-reference-policy metadata. This module-load-time registration
 * exists to (a) catch a duplicate method+path definition and (b) give U10 a
 * single place to enumerate the full route matrix for review — it is
 * deliberately NOT consulted by any request-time path matcher. Only Hono's
 * own router decides which route (and therefore which policy) a request
 * matches; see `createKrabiClawFacadeRouteMiddleware` in
 * `middleware/krabiclaw-facade.middleware.ts`.
 */
const registry: KrabiClawFacadeRouteDefinition[] = [];

const routeKey = (definition: Pick<KrabiClawFacadeRouteDefinition, 'method' | 'path'>): string =>
  `${definition.method.toUpperCase()} ${definition.path}`;

/**
 * Register one route's immutable policy metadata. Call this once per route
 * a route file exposes.
 *
 * @throws if a route with the same method and path is already registered.
 */
export const defineFacadeRoute = (definition: KrabiClawFacadeRouteDefinition): KrabiClawFacadeRouteDefinition => {
  const key = routeKey(definition);
  if (registry.some((existing) => routeKey(existing) === key)) {
    throw new Error(`Duplicate KrabiClaw facade route registration: ${key}`);
  }
  registry.push(definition);
  return definition;
};

/** The full registered route matrix, in registration order. For review/tooling only — never for request-time policy matching. */
export const listRegisteredFacadeRoutes = (): readonly KrabiClawFacadeRouteDefinition[] => registry;

/**
 * Test-only: clears the registry so isolated test suites can register their
 * own fixture routes without colliding with routes other test files (or
 * later units' real route files) register at import time.
 */
export const resetFacadeRouteRegistryForTests = (): void => {
  registry.length = 0;
};

/**
 * A route's method/path is otherwise declared twice — once on its
 * `KrabiClawFacadeRouteDefinition`, once on the `routeBuilder.build(...)`
 * call that actually registers the Hono route — with nothing structurally
 * forcing the two to agree. Call this immediately after building the route
 * (module load time, not request time) with the object `routeBuilder.build`
 * returned and the same `definition` passed to
 * `createKrabiClawFacadeRouteMiddleware`:
 *
 * ```ts
 * const route = routeBuilder.build({
 *   method: definition.method,
 *   path: definition.path,
 *   middleware: [createKrabiClawFacadeRouteMiddleware(definition)],
 *   responses: { ... },
 * });
 * registerFacadeRoute(route, definition); // throws immediately on mismatch or duplicate
 * app.openapi(route, handler);
 * ```
 *
 * Fails fast (throws at import time, before the app can serve traffic) if
 * the built route's method or path disagrees with its own policy
 * definition — never silently applies the wrong gate to a route.
 */
export const registerFacadeRoute = (
  route: { method: string; path: string },
  definition: KrabiClawFacadeRouteDefinition
): void => {
  if (route.method.toLowerCase() !== definition.method || route.path !== definition.path) {
    throw new Error(
      `KrabiClaw facade route registration mismatch: routeBuilder.build was called with ` +
        `${route.method.toUpperCase()} ${route.path}, but its KrabiClawFacadeRouteDefinition declares ` +
        `${definition.method.toUpperCase()} ${definition.path}. These must match exactly.`
    );
  }
  defineFacadeRoute(definition);
};
