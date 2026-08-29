import type { KrabiClawLegalScope } from '@/shared/auth/krabiclaw-oauth';

export type KrabiClawFacadeHttpMethod = 'get' | 'post' | 'patch' | 'delete' | 'put';

/**
 * The six default-off rollout groups from the Route Contract table (R26).
 * Each has its own config-driven gate, checked independently of the global
 * `KRABICLAW_FACADE_ENABLED` switch and of every other rollout group — see
 * `config.krabiclaw.rolloutGroups` in `src/shared/config/index.ts`.
 */
export const KRABICLAW_ROLLOUT_GROUPS = [
  'practice-read',
  'practice-mutation',
  'connect',
  'intake-without-payment',
  'intake-payment',
  'engagement',
] as const;

export type KrabiClawRolloutGroup = (typeof KRABICLAW_ROLLOUT_GROUPS)[number];

/** Which actor kinds may call a route (R11). */
export type KrabiClawRouteActorPolicy = 'human' | 'human-or-anonymous';

/**
 * Family used to key both rate-limit dimensions (R21). Traffic in one
 * family never consumes another family's bucket, for either dimension.
 */
export type KrabiClawRateFamily = 'practice' | 'connect' | 'intake' | 'engagement';

/** Whether the trusted request-reference header is required, optional, or unused for a route (KTD6). */
export type KrabiClawRequestReferencePolicy = 'none' | 'optional' | 'required';

/**
 * One authoritative, immutable registry entry (KTD2). Register a route with
 * `defineFacadeRoute` (see `route-registry.ts`) and pass the same object into
 * `createKrabiClawFacadeRouteMiddleware` as that route's `middleware` entry in
 * `routeBuilder.build(...)`. The middleware built from this definition is
 * attached directly to the exact Hono route it governs — no independent path
 * matcher may recompute or override policy for the request Hono actually
 * routed.
 */
export interface KrabiClawFacadeRouteDefinition {
  readonly method: KrabiClawFacadeHttpMethod;
  readonly path: string;
  readonly scope: KrabiClawLegalScope;
  readonly actorPolicy: KrabiClawRouteActorPolicy;
  readonly rateFamily: KrabiClawRateFamily;
  readonly rolloutGroup: KrabiClawRolloutGroup;
  readonly requestReferencePolicy: KrabiClawRequestReferencePolicy;
  /**
   * Only the engagement-acceptance route may read the trusted
   * originating-client-IP header (R27). Every other route must reject its
   * presence. Defaults to `false` when omitted.
   */
  readonly acceptsOriginatingClientIp?: boolean;
}
