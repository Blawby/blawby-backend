import { oauthProviderOpenIdConfigMetadata, oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import type { Hono } from 'hono';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';
import { db } from '@/shared/database';
import { autoCreateOrgForSubscription } from '@/shared/middleware/autoCreateOrgForSubscription';
import { normalizeAuthResponse } from '@/shared/middleware/normalizeAuthResponse';
import { sanitizeAuthResponse } from '@/shared/middleware/sanitizeAuthResponse';
import type { AppContext } from '@/shared/types/hono';

const getAuthInstance = (host: string | undefined) => {
  const redirectUri = betterAuthUtils.getGoogleRedirectUriForHost(host);
  return createBetterAuthInstance(db, redirectUri);
};

const registerAuthRoutes = (app: Hono<AppContext>): void => {
  app.use('/api/auth/*', normalizeAuthResponse());
  app.use('/api/auth/*', sanitizeAuthResponse());
  app.use('/api/auth/*', autoCreateOrgForSubscription());
  app.use('/oauth2/*', normalizeAuthResponse());
  app.use('/oauth2/*', sanitizeAuthResponse());

  // RFC 8414 AS metadata — path-aware issuer requires suffix
  app.get('/.well-known/oauth-authorization-server/api/auth', (c) =>
    oauthProviderAuthServerMetadata(getAuthInstance(c.req.header('host')))(c.req.raw)
  );

  // Bare path for non-RFC-compliant clients
  app.get('/.well-known/oauth-authorization-server', (c) =>
    oauthProviderAuthServerMetadata(getAuthInstance(c.req.header('host')))(c.req.raw)
  );

  // OIDC Discovery (RFC 8414 / OIDC Discovery 1.0)
  app.get('/api/auth/.well-known/openid-configuration', (c) =>
    oauthProviderOpenIdConfigMetadata(getAuthInstance(c.req.header('host')))(c.req.raw)
  );

  app.on(['POST', 'GET'], '/api/auth/*', (c) => getAuthInstance(c.req.header('host')).handler(c.req.raw));

  app.on(['POST', 'GET'], '/oauth2/*', (c) => getAuthInstance(c.req.header('host')).handler(c.req.raw));
};

export { registerAuthRoutes };
