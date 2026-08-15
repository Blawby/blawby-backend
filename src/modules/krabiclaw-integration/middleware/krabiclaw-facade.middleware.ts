import { getLogger } from '@logtape/logtape';
import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { parseFacadeHeaders } from '@/modules/krabiclaw-integration/middleware/parse-facade-headers';
import { verifyFacadeToken } from '@/modules/krabiclaw-integration/middleware/verify-facade-token';
import { krabiclawDirectoryService } from '@/modules/krabiclaw-integration/services/krabiclaw-directory.service';
import { krabiclawIdentityResolverService } from '@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service';
import type { KrabiClawFacadeHeaders } from '@/modules/krabiclaw-integration/types/facade-headers.types';
import type { KrabiClawResolvedIdentity } from '@/modules/krabiclaw-integration/types/identity.types';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { config } from '@/shared/config';
import { db } from '@/shared/database';
import { KrabiClawActorAttributed } from '@/shared/events/definitions/krabiclaw';
import type { AppContext } from '@/shared/types/hono';
import { sanitizeError } from '@/shared/utils/logging';

const logger = getLogger(['modules', 'krabiclaw-integration', 'facade-middleware']);

const resolveIdentityOrFail = async (headers: KrabiClawFacadeHeaders): Promise<KrabiClawResolvedIdentity> => {
  try {
    const organizationDirectory = await krabiclawDirectoryService.getOrganizationDirectoryRecord(
      headers.externalOrganizationId
    );
    const userDirectory =
      headers.actorKind === 'human' && headers.externalActorId
        ? await krabiclawDirectoryService.getUserDirectoryRecord(headers.externalActorId)
        : undefined;

    return await krabiclawIdentityResolverService.resolveIdentity({
      externalOrganizationId: headers.externalOrganizationId,
      organizationDirectory,
      actorKind: headers.actorKind,
      externalUserId: headers.externalActorId ?? undefined,
      userDirectory,
    });
  } catch (error) {
    logger.error('krabiclaw facade identity resolution failed: {error}', { error: sanitizeError(error) });
    throw new HTTPException(502, { message: 'Failed to resolve KrabiClaw identity' });
  }
};

const extractBearerToken = (authorizationHeader: string | undefined): string | undefined => {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return undefined;
  }
  return authorizationHeader.slice('Bearer '.length).trim() || undefined;
};

/**
 * Kill switch, OAuth verification, and header parsing only. Split from
 * {@link krabiclawFacadeIdentityMiddleware} so `http.ts` can run
 * organization-scoped rate limiting between the two — after the caller is
 * authenticated but before any D1/PostgreSQL/audit work happens.
 */
export const krabiclawFacadeAuthMiddleware = (): MiddlewareHandler<AppContext> => {
  const authInstance = createBetterAuthInstance(db);

  return async (c, next) => {
    if (!config.krabiclaw.facadeEnabled) {
      throw new HTTPException(404, { message: 'Not found' });
    }

    const token = extractBearerToken(c.req.header('authorization'));
    const { clientId } = await verifyFacadeToken(token, authInstance);
    const headers = parseFacadeHeaders(c);

    c.set('krabiclawFacadeAuth', { headers, clientId });
    return next();
  };
};

/**
 * D1/PostgreSQL identity resolution, audit dispatch, and LegalOperationContext.
 * Requires {@link krabiclawFacadeAuthMiddleware} to have run first so the
 * rate limiter can sit between the two without re-verifying the token or
 * re-parsing headers.
 */
export const krabiclawFacadeIdentityMiddleware = (): MiddlewareHandler<AppContext> => async (c, next) => {
  const auth = c.get('krabiclawFacadeAuth');
  if (!auth) {
    throw new Error('krabiclawFacadeIdentityMiddleware requires krabiclawFacadeAuthMiddleware to run first');
  }
  const { headers, clientId } = auth;

  const identity = await resolveIdentityOrFail(headers);

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

  c.set('legalOperationContext', { organizationId: identity.organizationId, userId: identity.userId });
  return next();
};
