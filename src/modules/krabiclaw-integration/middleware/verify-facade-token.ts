import { getLogger } from '@logtape/logtape';
import { verifyJwsAccessToken } from 'better-auth/oauth2';
import { HTTPException } from 'hono/http-exception';

import type { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { KRABICLAW_LEGAL_API_AUDIENCE, KRABICLAW_LEGAL_SCOPES } from '@/shared/auth/krabiclaw-oauth';
import { config } from '@/shared/config';

const logger = getLogger(['modules', 'krabiclaw-integration', 'verify-facade-token']);

// Stable identity so verifyJwsAccessToken's in-process JWKS fetch is cached
// Across requests instead of calling authInstance.api.getJwks() every time.
const JWKS_CACHE_KEY = {};

export interface VerifiedFacadeToken {
  clientId: string;
}

export const verifyFacadeToken = async (
  token: string | undefined,
  authInstance: ReturnType<typeof createBetterAuthInstance>
): Promise<VerifiedFacadeToken> => {
  if (!token) {
    throw new HTTPException(401, { message: 'Missing access token' });
  }

  let payload;
  try {
    payload = await verifyJwsAccessToken(token, {
      jwksFetch: () => authInstance.api.getJwks(),
      jwksCacheKey: JWKS_CACHE_KEY,
      verifyOptions: {
        audience: KRABICLAW_LEGAL_API_AUDIENCE,
        issuer: `${config.app.baseUrl}/api/auth`,
      },
    });
  } catch (error) {
    logger.warn('krabiclaw facade token verification failed: {error}', { error });
    throw new HTTPException(401, { message: 'Invalid access token' });
  }

  if (payload.sub) {
    throw new HTTPException(401, { message: 'Unexpected subject claim on a machine token' });
  }

  const clientId = typeof payload.client_id === 'string' ? payload.client_id : undefined;
  if (!clientId || clientId !== config.krabiclaw.oauthClientId) {
    throw new HTTPException(401, { message: 'Token was not issued to the configured KrabiClaw client' });
  }

  const grantedScopes = new Set((typeof payload.scope === 'string' ? payload.scope : '').split(' '));
  const hasLegalScope = KRABICLAW_LEGAL_SCOPES.some((scope) => grantedScopes.has(scope));
  if (!hasLegalScope) {
    throw new HTTPException(403, { message: 'Token is missing every legal:* scope' });
  }

  return { clientId };
};
