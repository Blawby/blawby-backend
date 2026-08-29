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
 * a route file exposes, and pass the same returned object as that route's
 * entry in `routeBuilder.build({ ..., middleware: [createKrabiClawFacadeRouteMiddleware(definition)] })`.
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
