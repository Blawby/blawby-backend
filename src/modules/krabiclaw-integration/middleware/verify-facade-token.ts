import { getLogger } from '@logtape/logtape';
import { verifyJwsAccessToken } from 'better-auth/oauth2';

import {
  KrabiClawMachineAuthError,
  KrabiClawPolicyForbiddenError,
} from '@/modules/krabiclaw-integration/errors/facade-errors';
import type { createBetterAuthInstance } from '@/shared/auth/better-auth';
import {
  KRABICLAW_LEGAL_API_AUDIENCE,
  KRABICLAW_LEGAL_SCOPES,
  type KrabiClawLegalScope,
} from '@/shared/auth/krabiclaw-oauth';
import { config } from '@/shared/config';

const logger = getLogger(['modules', 'krabiclaw-integration', 'verify-facade-token']);

// Stable identity so verifyJwsAccessToken's in-process JWKS fetch is cached
// Across requests instead of calling authInstance.api.getJwks() every time.
const JWKS_CACHE_KEY = {};

/**
 * JWT-verification errors from `jose` can carry the decoded (unverified)
 * claims — e.g. `sub`, email — as extra properties. Log only an allowlisted
 * classification, never the raw error, so a rejected token can't persist
 * claim data to application logs.
 */
const classifyVerificationError = (error: unknown): { errorName: string; errorCode: string | undefined } => {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  const errorCode =
    error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return { errorName, errorCode };
};

const isKrabiClawLegalScope = (value: string): value is KrabiClawLegalScope =>
  KRABICLAW_LEGAL_SCOPES.some((scope) => scope === value);

export interface VerifiedFacadeToken {
  clientId: string;
  /**
   * The token's `legal:*` scopes, normalized to the exact strings this
   * facade recognizes (KRABICLAW_LEGAL_SCOPES) and stripped of every other
   * (e.g. OIDC) scope. Route-scoped policy middleware checks a route's
   * exact scope against this set (R2) — it never re-parses the raw `scope`
   * claim itself.
   */
  grantedScopes: ReadonlySet<KrabiClawLegalScope>;
}

export const verifyFacadeToken = async (
  token: string | undefined,
  authInstance: ReturnType<typeof createBetterAuthInstance>
): Promise<VerifiedFacadeToken> => {
  if (!token) {
    throw new KrabiClawMachineAuthError('Missing access token');
  }

  const payload = await verifyJwsAccessToken(token, {
    jwksFetch: () => authInstance.api.getJwks(),
    jwksCacheKey: JWKS_CACHE_KEY,
    verifyOptions: {
      audience: KRABICLAW_LEGAL_API_AUDIENCE,
      issuer: `${config.app.baseUrl}/api/auth`,
    },
  }).catch((error: unknown) => {
    logger.warn(
      'krabiclaw facade token verification failed: {errorName} {errorCode}',
      classifyVerificationError(error)
    );
    throw new KrabiClawMachineAuthError('Invalid access token');
  });

  if (payload.sub !== undefined) {
    throw new KrabiClawMachineAuthError('Unexpected subject claim on a machine token');
  }

  const clientId = typeof payload.client_id === 'string' ? payload.client_id : undefined;
  if (!clientId || clientId !== config.krabiclaw.oauthClientId) {
    throw new KrabiClawMachineAuthError('Token was not issued to the configured KrabiClaw client');
  }

  const grantedScopes = new Set(
    (typeof payload.scope === 'string' ? payload.scope : '').split(' ').filter(isKrabiClawLegalScope)
  );
  if (grantedScopes.size === 0) {
    throw new KrabiClawPolicyForbiddenError('Token is missing every legal:* scope');
  }

  return { clientId, grantedScopes };
};
