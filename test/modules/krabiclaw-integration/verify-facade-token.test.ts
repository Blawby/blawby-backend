import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { jwt } from 'better-auth/plugins';
import { describe, expect, it, vi } from 'vitest';

import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { KRABICLAW_LEGAL_API_AUDIENCE, KRABICLAW_LEGAL_SCOPES } from '@/shared/auth/krabiclaw-oauth';
import { verifyFacadeToken } from '@/modules/krabiclaw-integration/middleware/verify-facade-token';
// Schema is used as namespace for drizzle adapter
// oxlint-disable-next-line no-namespace
import * as schema from '@/schema';
import { config } from '@/shared/config';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';

interface ConfigState {
  oauthClientId: string | undefined;
  baseUrl: string | undefined;
}

const configState = vi.hoisted((): ConfigState => ({ oauthClientId: undefined, baseUrl: undefined }));

vi.mock('@/shared/config', async (importOriginal) => {
  const actual = await importOriginal<{ config: typeof config }>();
  return {
    config: {
      ...actual.config,
      app: {
        ...actual.config.app,
        get baseUrl() {
          return configState.baseUrl ?? actual.config.app.baseUrl;
        },
      },
      krabiclaw: {
        ...actual.config.krabiclaw,
        get oauthClientId() {
          return configState.oauthClientId;
        },
      },
    },
  };
});

const auth = createBetterAuthInstance(getTestDb());

const issueToken = async (clientScope = KRABICLAW_LEGAL_SCOPES.join(' '), resource = KRABICLAW_LEGAL_API_AUDIENCE) => {
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
  // Client's full registered scope (oauth-provider's handleClientCredentialsGrant),
  // Instead of re-validating against the grant-type's scope allowlist.
  const token = await auth.api.oauth2Token({
    body: {
      grant_type: 'client_credentials',
      client_id: client.client_id,
      client_secret: client.client_secret,
      resource,
    },
  });
  return { client, accessToken: token.access_token };
};

/**
 * Builds a second Better Auth instance against the same test database so it
 * shares the real, DB-persisted JWKS signing key with `auth`. Its `jwt`
 * plugin is configured to match the audience/issuer `verifyFacadeToken`
 * expects, with a caller-controlled `sub` — the oauth-provider's
 * client_credentials grant never sets `sub`, so this is the only way to
 * exercise the machine-token `sub` rejection through a real signature and
 * the real, unmocked `verifyJwsAccessToken`.
 */
const createSubjectAssertingAuth = (subject: string) =>
  betterAuth({
    secret: config.auth.betterAuthSecret,
    database: drizzleAdapter(getTestDb(), { provider: 'pg', schema, usePlural: true }),
    baseURL: config.app.baseUrl || undefined,
    basePath: '/api/auth',
    advanced: { useSecureCookies: true },
    plugins: [
      jwt({
        jwt: {
          audience: KRABICLAW_LEGAL_API_AUDIENCE,
          issuer: `${config.app.baseUrl}/api/auth`,
          getSubject: () => subject,
        },
      }),
    ],
  });

const mintTokenWithSubject = async (subject: string): Promise<string> => {
  const { sessionToken } = await authHelpers.createSuperAdminSession();
  const subjectAssertingAuth = createSubjectAssertingAuth(subject);
  const { token } = await subjectAssertingAuth.api.getToken({ headers: new Headers({ cookie: sessionToken }) });
  return token;
};

describe('verifyFacadeToken', () => {
  it('accepts a valid token from the configured fixed client and retains its normalized granted legal scopes', async () => {
    const { client, accessToken } = await issueToken();
    configState.oauthClientId = client.client_id;

    await expect(verifyFacadeToken(accessToken, auth)).resolves.toEqual({
      clientId: client.client_id,
      grantedScopes: new Set(KRABICLAW_LEGAL_SCOPES),
    });
  });

  it('normalizes granted scopes to only the recognized legal:* set, dropping any other scope', async () => {
    const { client, accessToken } = await issueToken(`openid ${KRABICLAW_LEGAL_SCOPES[0]}`);
    configState.oauthClientId = client.client_id;

    const result = await verifyFacadeToken(accessToken, auth);

    expect(result.grantedScopes).toEqual(new Set([KRABICLAW_LEGAL_SCOPES[0]]));
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
    // Register the client with only non-legal (OIDC) scopes, so the resulting token's
    // `scope` claim contains no `legal:*` entry.
    const { client, accessToken } = await issueToken('openid profile');
    configState.oauthClientId = client.client_id;

    await expect(verifyFacadeToken(accessToken, auth)).rejects.toMatchObject({ status: 403 });
  });

  it('rejects a token issued for a different audience', async () => {
    const { accessToken } = await issueToken(KRABICLAW_LEGAL_SCOPES.join(' '), `${config.app.baseUrl}/mcp`);

    await expect(verifyFacadeToken(accessToken, auth)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a token whose issuer no longer matches the configured base URL', async () => {
    const { accessToken } = await issueToken();
    configState.baseUrl = 'https://impostor.example.test';

    try {
      await expect(verifyFacadeToken(accessToken, auth)).rejects.toMatchObject({ status: 401 });
    } finally {
      configState.baseUrl = undefined;
    }
  });

  it('rejects a token with a non-empty sub claim', async () => {
    const token = await mintTokenWithSubject('a-human-user-id');

    await expect(verifyFacadeToken(token, auth)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a token with an empty sub claim', async () => {
    const token = await mintTokenWithSubject('');

    await expect(verifyFacadeToken(token, auth)).rejects.toMatchObject({ status: 401 });
  });
});
