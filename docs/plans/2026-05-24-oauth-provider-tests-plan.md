# Plan: OAuth Provider Integration Tests

**Date:** 2026-05-24  
**Status:** Proposed  
**Feature under test:** Better Auth OAuth 2.1 / OIDC Provider implementation

## Goal

Add automated regression coverage for the OAuth Provider behavior that was validated manually by
`scripts/test-oauth-provider-local.sh`, using the existing Vitest and PostgreSQL integration-test setup.

The first implementation should prove our configuration, route mounting, organization-owner policy,
PKCE flow, token issuance, JWKS persistence, `userinfo`, and refresh-token flow. It should not try to
test Better Auth internals or the frontend consent page UI.

## Current State

- `src/shared/auth/better-auth.ts` installs `jwt()` and `oauthProvider()` and disables the standalone
  `/token` endpoint as required for this provider setup.
- OAuth client creation is restricted by `clientPrivileges`: the authenticated user must own their
  active organization.
- `src/shared/auth/better-auth.http.ts` exposes provider endpoints under `/api/auth/oauth2/*` and
  publishes OIDC/OAuth metadata routes.
- `scripts/test-oauth-provider-local.sh` successfully exercises discovery, sign-in, public PKCE
  client creation, authorization, consent, token exchange, `userinfo`, and refresh.
- `test/helpers/auth.ts` already uses Better Auth `testUtils()` through the test environment.
- `test/setup/globalSetup.ts` is being changed to initialize the test database through committed
  migrations, which is necessary for migration-sensitive OAuth coverage.

## Test Strategy

Use a **Vitest API integration test** against the real test PostgreSQL database and the auth route
surface. Keep the bash script as a manual local smoke test for real server configuration and frontend
origin redirect behavior.

Do not add Playwright in this phase. The protocol flow can be tested without rendering the login or
consent pages: assert the consent redirect URL and submit the consent API request using its signed
query, as the smoke script already does.

## Files

### Create

- `test/shared/auth/oauth-provider.test.ts`

### Modify

- `test/helpers/auth.ts`
  - Add a small helper that creates a user, organization membership, authenticated headers/cookie,
    and explicitly sets that organization as active.
  - The helper must accept a role so owner and non-owner authorization cases are deterministic.
- `vitest.config.ts`
  - Register `globalTeardown` so test database cleanup runs after the suite.
  - Disable file-level database test parallelism unless each file receives its own database.
- `test/setup/globalSetup.ts`
  - Retain committed migration execution for the fresh test database.
  - Update stale comments/log text that still describes schema push instead of migrations.

### Keep

- `scripts/test-oauth-provider-local.sh`
  - Remains a manually run smoke test; do not make CI depend on local credentials or a separately
    running development server.

## Test Harness Decisions

1. Use the existing full auth route mounting for this suite because metadata aliases, middleware,
   and `/api/auth/oauth2/*` route placement are part of the feature being protected.
2. Use Better Auth `testUtils()` for fixture users and authenticated sessions. It is intended for
   integration/E2E test fixture setup.
3. Explicitly set the active organization after creating membership. OAuth client privileges depend
   on `session.activeOrganizationId`; merely adding a member must not be assumed to establish it.
4. Use Node's `crypto` utilities to generate PKCE verifier/challenge and state in the test, not
   hard-coded values.
5. Make HTTP assertions against status, redirect `Location`, metadata fields, claims, and row
   existence. Do not assert token contents or signing key values exactly.
6. Let a fresh migration-built test database cover schema requirements: `jwkss`, OAuth UUID defaults,
   `refresh_id` type, and foreign keys must be available for the happy flow to complete.

## Phase 1: Foundation Fixes

### 1. Make database setup migration-based and deterministic

- Start each suite run with a fresh `blawby_test` database.
- Apply migrations using `drizzle-kit migrate`, not `drizzle-kit push`.
- Register the existing global teardown in Vitest.
- Run database integration test files sequentially until database-per-worker isolation exists.

**Reason:** the OAuth implementation depends on executable migration history, not just final schema
shape. This is what detects missing `gen_random_uuid()` defaults and unsafe type conversions.

### 2. Add active-organization auth fixture support

Add a helper with behavior similar to:

```ts
const createActiveOrganizationContext = async (role: MemberRole = 'owner') => {
  const context = await createTestContext(role);
  const headers = new Headers({ cookie: context.sessionToken });
  await betterAuth.api.setActiveOrganization({
    headers,
    body: { organizationId: context.org.id },
  });
  const session = await betterAuth.api.getSession({ headers });
  if (session?.session.activeOrganizationId !== context.org.id) {
    throw new Error('Failed to set active organization for OAuth test session.');
  }
  return { ...context, headers, session };
};
```

Verify the exact Better Auth API input shape while implementing; the required behavior is that the
session sent to `/oauth2/create-client` contains `activeOrganizationId === org.id`.

## Phase 2: Happy-Path OAuth/OIDC Test

Create `test/shared/auth/oauth-provider.test.ts` with one end-to-end API integration scenario:

| Step | Request | Assertions |
|---|---|---|
| 1 | `GET /api/auth/.well-known/openid-configuration` | `issuer` is `/api/auth`; authorize, token and `userinfo` endpoints are under `/api/auth/oauth2/*` |
| 2 | Auth fixture: active organization owner | Session contains the created organization's ID |
| 3 | `POST /api/auth/oauth2/create-client` with public PKCE client metadata | Success; returns `client_id`; created OAuth client is associated with active organization |
| 4 | `GET /api/auth/oauth2/authorize` with `state`, `code_challenge`, S256 and `openid profile email offline_access` | Redirects to configured frontend `/oauth/consent`; signed query is included |
| 5 | `POST /api/auth/oauth2/consent` with acceptance and signed OAuth query | Returns callback URL containing authorization code and original `state` |
| 6 | `POST /api/auth/oauth2/token` using code verifier | Returns bearer access token, ID token and refresh token; expected scopes present |
| 7 | `GET /api/auth/oauth2/userinfo` with access token | Returns the fixture user's `sub`, `email` and profile claim data |
| 8 | `POST /api/auth/oauth2/token` using refresh token | Returns a fresh bearer token response |

### Persistence assertions

After the token steps, make focused database assertions:

- At least one `jwkss` record exists, proving JWT/JWKS signing can persist a key.
- The created OAuth client has `referenceId` equal to the active organization ID.
- OAuth token rows exist for the issued client.

Avoid checking private key material or stored token values.

## Phase 3: Policy And Protocol Failures

Add focused tests after the happy path is stable:

| Case | Expected Outcome |
|---|---|
| Unauthenticated request to create client | Request rejected |
| Authenticated member who is not owner creates client | Request rejected |
| Authorization with unregistered redirect URI | Request rejected; no code issued |
| Token exchange with wrong PKCE verifier | Request rejected; no tokens returned |
| Consent rejection | Callback contains an OAuth denial/error; no usable authorization code |
| Refresh using invalid token | Request rejected |

Keep these tests independent: each one should create its own client or fixture state when needed.

## Optional Phase 4: Browser Coverage

Only add Playwright after frontend consent/login pages are in scope. One browser-level test is enough:

1. Seed an authenticated owner/session using Better Auth test utilities.
2. Navigate through the authorize redirect.
3. Confirm the real consent page renders requested scopes.
4. Approve consent.
5. Assert the browser reaches the registered callback URL.

Do not reproduce token-level failure matrices in Playwright; keep those in Vitest API integration tests.

## Acceptance Criteria

- A new Vitest suite exercises OAuth discovery through refresh-token exchange without local user
  credentials or a separately running server.
- The suite runs against a fresh PostgreSQL test database created from committed migrations.
- Owner client creation passes and non-owner creation fails.
- The happy flow proves that JWKS, OAuth clients and issued token records can be written.
- `pnpm test test/shared/auth/oauth-provider.test.ts` passes repeatedly.
- `pnpm test` passes with the new suite included.
- `pnpm run typecheck` passes.
- The bash smoke test remains usable for manual local verification.

## References

- Better Auth OAuth Provider: https://better-auth.com/docs/plugins/oauth-provider
- Better Auth Test Utils: https://better-auth.com/docs/plugins/test-utils
- Hono testing: https://hono.dev/docs/guides/testing
- Vitest global setup: https://vitest.dev/config/globalsetup
