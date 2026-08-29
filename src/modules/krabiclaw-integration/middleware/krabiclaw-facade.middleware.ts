import { z } from '@hono/zod-openapi';
import { getLogger } from '@logtape/logtape';
import type { Context, MiddlewareHandler } from 'hono';

import {
  CLIENT_FAMILY_CEILING,
  ORGANIZATION_FAMILY_BUCKET,
  type KrabiClawRateLimitBudget,
} from '@/modules/krabiclaw-integration/config/rate-limits';
import {
  KrabiClawFacadeDisabledError,
  KrabiClawFacadeValidationError,
  KrabiClawPolicyForbiddenError,
  KrabiClawRateLimitedError,
  KrabiClawUpstreamDependencyError,
} from '@/modules/krabiclaw-integration/errors/facade-errors';
import { parseFacadeHeaders } from '@/modules/krabiclaw-integration/middleware/parse-facade-headers';
import { verifyFacadeToken } from '@/modules/krabiclaw-integration/middleware/verify-facade-token';
import { krabiclawDirectoryService } from '@/modules/krabiclaw-integration/services/krabiclaw-directory.service';
import { krabiclawIdentityResolverService } from '@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service';
import type {
  KrabiClawOrganizationDirectoryRecord,
  KrabiClawUserDirectoryRecord,
} from '@/modules/krabiclaw-integration/types/directory.types';
import type { KrabiClawFacadeRequestContext } from '@/modules/krabiclaw-integration/types/facade-context.types';
import type { KrabiClawFacadeHeaders } from '@/modules/krabiclaw-integration/types/facade-headers.types';
import type { KrabiClawResolvedIdentity } from '@/modules/krabiclaw-integration/types/identity.types';
import type { KrabiClawFacadeRouteDefinition } from '@/modules/krabiclaw-integration/types/route-policy.types';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { config } from '@/shared/config';
import { db } from '@/shared/database';
import { KrabiClawActorAttributed } from '@/shared/events/definitions/krabiclaw';
import { rateLimit } from '@/shared/middleware/rateLimit';
import type { AppContext } from '@/shared/types/hono';
import { sanitizeError } from '@/shared/utils/logging';

const logger = getLogger(['modules', 'krabiclaw-integration', 'facade-middleware']);

/** Stable Better Auth instance so `verifyFacadeToken`'s in-process JWKS cache is shared across requests instead of being rebuilt every time. */
const authInstance = createBetterAuthInstance(db);

const extractBearerToken = (authorizationHeader: string | undefined): string | undefined => {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return undefined;
  }
  return authorizationHeader.slice('Bearer '.length).trim() || undefined;
};

interface ResolvedFacadeIdentity {
  identity: KrabiClawResolvedIdentity;
  organizationDirectory: KrabiClawOrganizationDirectoryRecord;
  userDirectory: KrabiClawUserDirectoryRecord | null;
}

const resolveIdentityOrFail = async (headers: KrabiClawFacadeHeaders): Promise<ResolvedFacadeIdentity> => {
  try {
    const organizationDirectory = await krabiclawDirectoryService.getOrganizationDirectoryRecord(
      headers.externalOrganizationId
    );
    // R20 — an anonymous actor kind never triggers a D1 user lookup, even though `headers.externalActorId` is always present (R4).
    const userDirectory =
      headers.actorKind === 'human'
        ? await krabiclawDirectoryService.getUserDirectoryRecord(headers.externalActorId)
        : null;

    const identity = await krabiclawIdentityResolverService.resolveIdentity({
      externalOrganizationId: headers.externalOrganizationId,
      organizationDirectory,
      actorKind: headers.actorKind,
      externalUserId: headers.actorKind === 'human' ? headers.externalActorId : undefined,
      userDirectory: userDirectory ?? undefined,
    });

    return { identity, organizationDirectory, userDirectory };
  } catch (error) {
    logger.error('krabiclaw facade identity resolution failed: {error}', { error: sanitizeError(error) });
    throw new KrabiClawUpstreamDependencyError(502, 'Failed to resolve KrabiClaw identity');
  }
};

const assertScopeAndRolloutGroup = (
  definition: KrabiClawFacadeRouteDefinition,
  grantedScopes: ReadonlySet<string>
): void => {
  // R2/AE1: exact scope for the route's family, nothing broader.
  if (!grantedScopes.has(definition.scope)) {
    throw new KrabiClawPolicyForbiddenError();
  }
  /**
   * R26/AE8 — the route's rollout group has its own default-off gate,
   * independent of every other rollout group and of the global switch.
   */
  if (!config.krabiclaw.rolloutGroups[definition.rolloutGroup]) {
    throw new KrabiClawPolicyForbiddenError();
  }
};

const assertActorKindAllowed = (definition: KrabiClawFacadeRouteDefinition, headers: KrabiClawFacadeHeaders): void => {
  /** R11 — human-only routes reject an anonymous actor; human-or-anonymous routes accept both. */
  if (definition.actorPolicy === 'human' && headers.actorKind !== 'human') {
    throw new KrabiClawPolicyForbiddenError();
  }
};

const assertRequestReferencePolicy = (
  definition: KrabiClawFacadeRouteDefinition,
  requestReference: string | null
): void => {
  if (definition.requestReferencePolicy === 'required' && !requestReference) {
    throw new KrabiClawFacadeValidationError('Request reference header is required for this route');
  }
  if (definition.requestReferencePolicy === 'none' && requestReference) {
    throw new KrabiClawFacadeValidationError('Request reference header is not accepted for this route');
  }
};

const assertOriginatingClientIpPolicy = (
  definition: KrabiClawFacadeRouteDefinition,
  trustedOriginatingClientIp: string | null
): void => {
  // R27 — only the engagement-acceptance route may carry this header.
  if (!definition.acceptsOriginatingClientIp && trustedOriginatingClientIp) {
    throw new KrabiClawFacadeValidationError('Originating-client-IP header is not accepted for this route');
  }
};

const rateLimitRejectionBodySchema = z.object({ retry_after: z.number() });

const readRetryAfterSeconds = async (rejection: Response | void): Promise<number> => {
  if (!(rejection instanceof Response)) {
    return 1;
  }
  const body: unknown = await rejection
    .clone()
    .json()
    .catch(() => null);
  const parsed = rateLimitRejectionBodySchema.safeParse(body);
  return parsed.success ? parsed.data.retry_after : 1;
};

/**
 * Runs one rate-limit dimension through the shared Postgres-backed limiter
 * (`src/shared/middleware/rateLimit.ts`) and reshapes a rejection into the
 * facade's own error type instead of returning the shared middleware's
 * response body verbatim, so every facade 429 carries the same reviewed
 * shape and `Cache-Control: no-store`.
 */
const runFamilyRateLimitGate = async (
  c: Context<AppContext>,
  routeKeySuffix: string,
  scopeKey: string,
  budget: KrabiClawRateLimitBudget
): Promise<void> => {
  let passed = false;
  const rejection = await rateLimit({
    routeKey: `krabiclaw-facade:${routeKeySuffix}`,
    points: budget.points,
    duration: budget.duration,
    scope: () => scopeKey,
  })(c, () => {
    passed = true;
    return Promise.resolve();
  });

  if (!passed) {
    throw new KrabiClawRateLimitedError(await readRetryAfterSeconds(rejection));
  }
};

/**
 * Builds the route-scoped policy gate (KTD2) for one registry entry.
 * Attach it directly to the exact Hono route it governs — e.g. as
 * `middleware: [createKrabiClawFacadeRouteMiddleware(definition)]` in
 * `routeBuilder.build(...)`. Enforces, strictly in order and short-circuiting
 * on the first failure, before any D1/PostgreSQL/Stripe call:
 *
 * 1. Global facade switch (belt-and-suspenders; the catch-all in `http.ts`
 *    already rejects a disabled facade before Hono even matches a route).
 * 2. Machine-token verification (fixed client, audience, exact scope).
 * 3. This route's rollout-group gate.
 * 4. Allowed actor kind.
 * 5. Trusted header bounds: request-reference policy, originating-client-IP policy.
 * 6. Fixed-client + family rate-limit ceiling, then claimed-organization + family bucket.
 * 7. D1 identity resolution and `KrabiClawFacadeRequestContext` assembly.
 */
export const createKrabiClawFacadeRouteMiddleware =
  (definition: KrabiClawFacadeRouteDefinition): MiddlewareHandler<AppContext> =>
  async (c, next) => {
    if (!config.krabiclaw.facadeEnabled) {
      throw new KrabiClawFacadeDisabledError();
    }

    const token = extractBearerToken(c.req.header('authorization'));
    const { clientId, grantedScopes } = await verifyFacadeToken(token, authInstance);

    assertScopeAndRolloutGroup(definition, grantedScopes);

    const headers = parseFacadeHeaders(c);
    assertActorKindAllowed(definition, headers);
    assertRequestReferencePolicy(definition, headers.requestReference);
    assertOriginatingClientIpPolicy(definition, headers.trustedOriginatingClientIp);

    await runFamilyRateLimitGate(c, `client:${definition.rateFamily}`, `client:${clientId}`, CLIENT_FAMILY_CEILING);
    await runFamilyRateLimitGate(
      c,
      `org:${definition.rateFamily}`,
      `org:${headers.externalOrganizationId}`,
      ORGANIZATION_FAMILY_BUCKET
    );

    const { identity, organizationDirectory, userDirectory } = await resolveIdentityOrFail(headers);

    await KrabiClawActorAttributed.dispatch(
      {
        external_organization_id: headers.externalOrganizationId,
        external_actor_id: headers.externalActorId,
        actor_kind: headers.actorKind,
        oauth_client_id: clientId,
        resolved_organization_id: identity.organizationId,
        resolved_user_id: identity.userId,
        method: c.req.method,
        path: c.req.path,
      },
      { actorId: identity.userId ?? 'api', organizationId: identity.organizationId, critical: true }
    );

    const legalOperationContext = { organizationId: identity.organizationId, userId: identity.userId };
    const requestContext: KrabiClawFacadeRequestContext = {
      externalOrganizationId: headers.externalOrganizationId,
      externalActorId: headers.externalActorId,
      actorKind: headers.actorKind,
      requestReference: headers.requestReference,
      trustedOriginatingClientIp: headers.trustedOriginatingClientIp,
      organizationDirectory,
      userDirectory,
      legalOperationContext,
    };

    c.set('legalOperationContext', legalOperationContext);
    c.set('krabiclawFacadeRequestContext', requestContext);
    return next();
  };
