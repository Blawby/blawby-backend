import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { KRABICLAW_LEGAL_API_AUDIENCE, KRABICLAW_LEGAL_SCOPES } from '@/shared/auth/krabiclaw-oauth';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';
import { describe, expect, it } from 'vitest';

const auth = createBetterAuthInstance(getTestDb());

const createLegalClient = async (sessionToken: string) =>
  auth.api.adminCreateOAuthClient({
    headers: new Headers({ cookie: sessionToken }),
    body: {
      redirect_uris: ['https://krabiclaw.blawby.dev/oauth/callback'],
      grant_types: ['client_credentials'],
      token_endpoint_auth_method: 'client_secret_basic',
      type: 'web',
      scope: KRABICLAW_LEGAL_SCOPES.join(' '),
      client_name: 'krabiclaw-legal-facade-test',
      require_pkce: false,
    },
  });

describe('krabiclaw machine OAuth', () => {
  it('rejects OAuth client creation from a session that is not a staff super_admin', async () => {
    const { sessionToken } = await authHelpers.createNonOrgUserSession();
    await expect(
      auth.api.adminCreateOAuthClient({
        headers: new Headers({ cookie: sessionToken }),
        body: {
          redirect_uris: ['https://krabiclaw.blawby.dev/oauth/callback'],
          grant_types: ['client_credentials'],
          scope: 'legal:practice',
        },
      })
    ).rejects.toThrow();
  });

  it('issues a legal-api access token with the correct audience, azp, scope, and one-hour expiry', async () => {
    const { sessionToken } = await authHelpers.createSuperAdminSession();
    const client = await createLegalClient(sessionToken);

    const token = await auth.api.oauth2Token({
      body: {
        grant_type: 'client_credentials',
        client_id: client.client_id,
        client_secret: client.client_secret,
        scope: 'legal:practice legal:connect',
        resource: KRABICLAW_LEGAL_API_AUDIENCE,
      },
    });
    expect(token.expires_in).toBe(3600);

    const introspected = await auth.api.oauth2Introspect({
      body: { token: token.access_token, client_id: client.client_id, client_secret: client.client_secret },
    });
    expect(introspected).toMatchObject({
      active: true,
      aud: KRABICLAW_LEGAL_API_AUDIENCE,
      azp: client.client_id,
      client_id: client.client_id,
      scope: 'legal:practice legal:connect',
    });
    expect(introspected.exp - introspected.iat).toBe(3600);
  });

  it('rejects introspection of an unknown/opaque token instead of resolving it', async () => {
    const { sessionToken } = await authHelpers.createSuperAdminSession();
    const client = await createLegalClient(sessionToken);

    await expect(
      auth.api.oauth2Introspect({
        body: { token: 'not-a-real-token', client_id: client.client_id, client_secret: client.client_secret },
      })
    ).rejects.toThrow();
  });

  it('rejects a token request for a scope the client was not granted', async () => {
    const { sessionToken } = await authHelpers.createSuperAdminSession();
    const client = await createLegalClient(sessionToken);

    await expect(
      auth.api.oauth2Token({
        body: {
          grant_type: 'client_credentials',
          client_id: client.client_id,
          client_secret: client.client_secret,
          scope: 'legal:not-a-real-scope',
        },
      })
    ).rejects.toThrow();
  });

  it('rejects a token request with the wrong client secret', async () => {
    const { sessionToken } = await authHelpers.createSuperAdminSession();
    const client = await createLegalClient(sessionToken);

    await expect(
      auth.api.oauth2Token({
        body: {
          grant_type: 'client_credentials',
          client_id: client.client_id,
          client_secret: 'wrong-secret',
          scope: 'legal:practice',
        },
      })
    ).rejects.toThrow();
  });

  it('keeps legal scopes unavailable through dynamic client registration (the MCP path)', async () => {
    await expect(
      auth.api.registerOAuthClient({
        body: {
          redirect_uris: ['https://example.com/callback'],
          grant_types: ['authorization_code'],
          token_endpoint_auth_method: 'none',
          type: 'user-agent-based',
          scope: 'openid legal:practice',
        },
      })
    ).rejects.toThrow();
  });

  it('leaves normal MCP dynamic client registration scopes unchanged', async () => {
    const dynamicClient = await auth.api.registerOAuthClient({
      body: {
        redirect_uris: ['https://example.com/callback'],
        grant_types: ['authorization_code'],
        token_endpoint_auth_method: 'none',
        type: 'user-agent-based',
        scope: 'openid profile email offline_access',
      },
    });
    expect(dynamicClient.scope).toBe('openid profile email offline_access');
  });

  it('lets a DIFFERENT staff super_admin rotate a client they did not create, and invalidates the old secret', async () => {
    const admin1 = await authHelpers.createSuperAdminSession();
    const admin2 = await authHelpers.createSuperAdminSession();
    const client = await createLegalClient(admin1.sessionToken);
    const oldSecret = client.client_secret;

    const rotated = await auth.api.rotateClientSecret({
      headers: new Headers({ cookie: admin2.sessionToken }),
      body: { client_id: client.client_id },
    });
    expect(rotated.client_secret).not.toBe(oldSecret);

    await expect(
      auth.api.oauth2Token({
        body: {
          grant_type: 'client_credentials',
          client_id: client.client_id,
          client_secret: oldSecret,
          scope: 'legal:practice',
        },
      })
    ).rejects.toThrow();

    const tokenWithNewSecret = await auth.api.oauth2Token({
      body: {
        grant_type: 'client_credentials',
        client_id: client.client_id,
        client_secret: rotated.client_secret,
        scope: 'legal:practice',
      },
    });
    expect(tokenWithNewSecret.access_token).toBeTruthy();
  });
});
