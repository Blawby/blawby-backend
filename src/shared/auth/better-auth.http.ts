import { oauthProviderOpenIdConfigMetadata, oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import type { Hono } from 'hono';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { subscriptionCompatHandlers } from '@/shared/auth/subscription-compat';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';
import { db } from '@/shared/database';
import { normalizeAuthResponse } from '@/shared/middleware/normalizeAuthResponse';
import { sanitizeAuthResponse } from '@/shared/middleware/sanitizeAuthResponse';

import { config } from '@/shared/config';
import type { AppContext } from '@/shared/types/hono';

const getAuthInstance = (host: string | undefined) => {
  const redirectUri = betterAuthUtils.getGoogleRedirectUriForHost(host);
  return createBetterAuthInstance(db, redirectUri);
};

const registerAuthRoutes = (app: Hono<AppContext>): void => {
  app.use('/api/auth/*', normalizeAuthResponse());
  app.use('/api/auth/*', sanitizeAuthResponse());

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

  // Fallback for clients that incorrectly ignore the path-qualified issuer.
  app.get('/.well-known/openid-configuration', (c) =>
    oauthProviderOpenIdConfigMetadata(getAuthInstance(c.req.header('host')))(c.req.raw)
  );

  // Compat aliases — must be registered BEFORE the Better Auth catch-all
  app.post('/api/auth/subscription/upgrade', subscriptionCompatHandlers.compatUpgradeHandler);
  app.post('/api/auth/subscription/cancel', subscriptionCompatHandlers.compatCancelHandler);
  app.get('/api/auth/subscription/list', subscriptionCompatHandlers.compatListHandler);
  // /cancel and /billing-portal both open the Stripe billing portal (cancel-at-period-end handled inside portal)
  app.post('/api/auth/subscription/billing-portal', subscriptionCompatHandlers.compatCancelHandler);
  app.post('/api/auth/stripe/webhook', subscriptionCompatHandlers.compatWebhookHandler);

  app.on(['POST', 'GET'], '/api/auth/*', (c) => getAuthInstance(c.req.header('host')).handler(c.req.raw));

  // RFC 9728 Protected Resource Metadata for MCP server
  app.get('/.well-known/oauth-protected-resource/mcp', (c) => {
    const baseUrl = config.app.baseUrl;
    if (!baseUrl) {
      return c.json({ error: 'Server misconfigured: baseUrl not set' }, 500);
    }
    return c.json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl],
      resource_name: 'Blawby MCP API',
    });
  });
};

export { registerAuthRoutes };
