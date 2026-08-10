import { describe, expect, it, vi } from 'vitest';

import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { KRABICLAW_LEGAL_API_AUDIENCE, KRABICLAW_LEGAL_SCOPES } from '@/shared/auth/krabiclaw-oauth';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';

const configState = vi.hoisted(() => ({ oauthClientId: undefined as string | undefined }));

vi.mock('@/shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/config')>();
  return {
    config: {
      ...actual.config,
      krabiclaw: {
        ...actual.config.krabiclaw,
        get oauthClientId() {
          return configState.oauthClientId;
        },
      },
    },
  };
});

// Imported after the mock so the module under test picks up the mocked config.
const { verifyFacadeToken } = await import('@/modules/krabiclaw-integration/middleware/verify-facade-token');

const auth = createBetterAuthInstance(getTestDb());

const issueToken = async (clientScope = KRABICLAW_LEGAL_SCOPES.join(' ')) => {
  const { sessionToken } = await authHelpers.createSuperAdminSession();
  const client = await auth.api.adminCreateOAuthClient({
    headers: new Headers({ cookie: sessionToken }),
    body: {
      redirect_uris: ['https://krabiclaw.blawby.dev/oauth/callback'],
      grant_types: ['client_credentials'],
      token_endpoint_auth_method: 'client_secret_basic',
      type: 'web',
      scope: clientScope,
      client_name: `verify-facade-token-test-${Math.random()}`,
      require_pkce: false,
    },
  });
  // Omitting `scope` on the token request makes better-auth default to the
  // client's full registered scope (oauth-provider's handleClientCredentialsGrant),
  // instead of re-validating against the grant-type's scope allowlist.
  const token = await auth.api.oauth2Token({
    body: {
      grant_type: 'client_credentials',
      client_id: client.client_id,
      client_secret: client.client_secret,
      resource: KRABICLAW_LEGAL_API_AUDIENCE,
    },
  });
  return { client, accessToken: token.access_token };
};

describe('verifyFacadeToken', () => {
  it('accepts a valid token from the configured fixed client', async () => {
    const { client, accessToken } = await issueToken();
    configState.oauthClientId = client.client_id;

    await expect(verifyFacadeToken(accessToken, auth)).resolves.toEqual({ clientId: client.client_id });
  });

  it('rejects a missing token', async () => {
    await expect(verifyFacadeToken(undefined, auth)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a malformed token', async () => {
    await expect(verifyFacadeToken('not-a-jwt', auth)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a token whose azp does not match the configured fixed client', async () => {
    const { accessToken } = await issueToken();
    configState.oauthClientId = 'a-different-client-id';

    await expect(verifyFacadeToken(accessToken, auth)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a token missing every legal scope', async () => {
    // Register the client with only non-legal (OIDC) scopes, so the resulting
    // client_credentials token's `scope` claim contains no `legal:*` entry.
    const { client, accessToken } = await issueToken('openid profile');
    configState.oauthClientId = client.client_id;

    await expect(verifyFacadeToken(accessToken, auth)).rejects.toMatchObject({ status: 403 });
  });
});
