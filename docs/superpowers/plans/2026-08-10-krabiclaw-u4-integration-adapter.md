# KrabiClaw U4: Trusted Integration Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the middleware that verifies KrabiClaw's machine OAuth token, parses its strict single-value identity headers, resolves them to local UUID anchors, and produces an auth-independent `LegalOperationContext` — with no HTTP routes exposed yet (that's U8).

**Architecture:** Two composed Hono middlewares mounted on a new, still-routeless `src/modules/krabiclaw-integration/http.ts`: (1) `krabiclawFacadeMiddleware` — kill switch, in-process JWT verification (JWKS fetched via Better Auth's own in-process API, no network round trip), header parsing, identity resolution (reusing U3's resolver + U2's D1 directory service), immutable audit-event dispatch, and setting `LegalOperationContext` on the Hono context; (2) the existing `rateLimit` middleware, scoped to the resolved organization. `LegalOperationContext` is `{ organizationId, userId }` only — no external ids, no Hono context, no CASL — matching KTD22.

**Tech Stack:** Hono middleware, Better Auth's `@better-auth/oauth-provider` + `jose` (via `verifyJwsAccessToken` from `better-auth/oauth2`), the existing PostgreSQL-backed `rateLimit` middleware, the repo's event-dispatch system (`BaseEvent`/`events` table).

## Global Constraints

- R7: KrabiClaw sends its verified external organization ID, actor ID, and actor kind via headers; Blawby never trusts browser-supplied auth/identity.
- R20: Existing routes keep using `ServiceContext`; the facade constructs a separate, auth-independent `LegalOperationContext`.
- R39: Initial facade access is owner/admin-only — enforced on KrabiClaw's side (R1: KrabiClaw is authoritative for roles/memberships). Blawby's adapter does not and cannot re-derive a role for a KrabiClaw actor (KTD22 forbids passing roles into Legal Operations, and KTD5 anchors have no memberships). Out of scope for this unit's Blawby-side code — do not add role logic here.
- R47: Every route family is default-off in KrabiClaw, and the entire Blawby facade has a default-off kill switch. This unit adds Blawby's kill switch (`KRABICLAW_FACADE_ENABLED`, default off).
- KTD17: The integration module owns only authentication, identity translation, D1 access, and HTTP adaptation. No Legal Operation code is touched in this unit.
- KTD22: `LegalOperationContext` cannot carry Better Auth users, sessions, CASL abilities, roles, permission claims, Hono contexts, D1 clients, external IDs, or mapping repositories. It is exactly `{ organizationId: string; userId: string | null }`.
- Follow `AGENTS.md`: `@/` imports only, `HTTPException` for expected failures, no `any`/unsafe `as`, `getLogger` for logging, `uow`/`getActiveTx` are not needed here (no transactional writes beyond the two already-transactional pieces reused from U3/event dispatch).
- Do not add any real route handler in `http.ts` — U8 owns exposing `/api/practice/details` etc. This unit's `http.ts` mounts middleware only; every path 404s (from the kill switch when disabled, or from Hono's default not-found once enabled) until U8 adds routes.

---

### Task 1: Audit event definition

**Files:**

- Create: `src/shared/events/definitions/krabiclaw.ts`
- Test: `test/shared/events/krabiclaw-actor-attributed.test.ts`

**Interfaces:**

- Produces: `KrabiClawActorAttributedPayload` (typed payload), `KrabiClawActorAttributed` (event class, `static type = 'krabiclaw.actor_attributed'`). Consumed by Task 4's middleware via `KrabiClawActorAttributed.dispatch(payload, { actorId, organizationId })`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/shared/events/krabiclaw-actor-attributed.test.ts
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { KrabiClawActorAttributed } from '@/shared/events/definitions/krabiclaw';
import { events } from '@/shared/events/schemas/events.schema';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';

describe('KrabiClawActorAttributed', () => {
  it('persists an immutable audit row for a human actor', async () => {
    const userId = '10000000-0000-4000-8000-000000000001';
    const { id: organizationId } = await authHelpers.createTestOrganization();

    const eventId = await KrabiClawActorAttributed.dispatch(
      {
        external_organization_id: 'ext-org-1',
        external_actor_id: 'ext-user-1',
        actor_kind: 'human',
        oauth_client_id: 'client-abc',
        resolved_organization_id: organizationId,
        resolved_user_id: userId,
        method: 'GET',
        path: '/practice/details',
      },
      { actorId: userId, organizationId, critical: true }
    );

    const [row] = await getTestDb().select().from(events).where(eq(events.eventId, eventId));
    expect(row?.type).toBe('krabiclaw.actor_attributed');
    expect(row?.actorId).toBe(userId);
    expect(row?.organizationId).toBe(organizationId);
    expect(row?.payload).toMatchObject({
      external_organization_id: 'ext-org-1',
      actor_kind: 'human',
      resolved_user_id: userId,
    });
  });

  it('persists an audit row for an anonymous actor using the api actor sentinel', async () => {
    const { id: organizationId } = await authHelpers.createTestOrganization();

    const eventId = await KrabiClawActorAttributed.dispatch(
      {
        external_organization_id: 'ext-org-2',
        external_actor_id: null,
        actor_kind: 'anonymous',
        oauth_client_id: 'client-abc',
        resolved_organization_id: organizationId,
        resolved_user_id: null,
        method: 'POST',
        path: '/intakes',
      },
      { actorId: 'api', organizationId, critical: true }
    );

    const [row] = await getTestDb().select().from(events).where(eq(events.eventId, eventId));
    expect(row?.actorType).toBe('api');
    expect(row?.payload).toMatchObject({ actor_kind: 'anonymous', resolved_user_id: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/shared/events/krabiclaw-actor-attributed.test.ts`
Expected: FAIL — cannot find module `@/shared/events/definitions/krabiclaw`.

- [ ] **Step 3: Write the event definition**

```typescript
// src/shared/events/definitions/krabiclaw.ts
import { BaseEvent } from '@/shared/events/event';

export interface KrabiClawActorAttributedPayload extends Record<string, unknown> {
  external_organization_id: string;
  external_actor_id: string | null;
  actor_kind: 'human' | 'anonymous';
  oauth_client_id: string;
  resolved_organization_id: string;
  resolved_user_id: string | null;
  method: string;
  path: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// KRABICLAW FACADE EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class KrabiClawActorAttributed extends BaseEvent<KrabiClawActorAttributedPayload> {
  static type = 'krabiclaw.actor_attributed' as const;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/shared/events/krabiclaw-actor-attributed.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/events/definitions/krabiclaw.ts test/shared/events/krabiclaw-actor-attributed.test.ts
git commit -m "feat(krabiclaw-integration): add actor-attribution audit event"
```

---

### Task 2: Facade header parsing

**Files:**

- Create: `src/modules/krabiclaw-integration/types/facade-headers.types.ts`
- Create: `src/modules/krabiclaw-integration/middleware/parse-facade-headers.ts`
- Test: `test/modules/krabiclaw-integration/parse-facade-headers.test.ts`

**Interfaces:**

- Consumes: `KrabiClawActorKind` from `@/modules/krabiclaw-integration/types/identity.types` (already shipped in U3).
- Produces: `KrabiClawFacadeHeaders = { externalOrganizationId: string; externalActorId: string | null; actorKind: KrabiClawActorKind }`; `parseFacadeHeaders(c: Context): KrabiClawFacadeHeaders` — throws `HTTPException(400)` on missing/duplicate/malformed/inconsistent headers. Consumed by Task 4's middleware.

Header contract (fixed by this task, not specified elsewhere in the plan): `X-Krabiclaw-Organization-Id`, `X-Krabiclaw-Actor-Id`, `X-Krabiclaw-Actor-Kind` (`human` or `anonymous`). Hono's `Headers.get()` joins repeated headers with a comma-space separator per the Fetch spec, so a duplicated header arrives as a single comma-containing string — reject any header value containing a comma as malformed/duplicated, since none of these three values are ever legitimately comma-containing.

- [ ] **Step 1: Write the failing test**

```typescript
// test/modules/krabiclaw-integration/parse-facade-headers.test.ts
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';

import { parseFacadeHeaders } from '@/modules/krabiclaw-integration/middleware/parse-facade-headers';

const contextFromHeaders = async (headers: Record<string, string>) => {
  let captured: unknown;
  const app = new Hono();
  app.get('/', (c) => {
    captured = parseFacadeHeaders(c);
    return c.text('ok');
  });
  const res = await app.request('/', { headers });
  return { res, captured };
};

describe('parseFacadeHeaders', () => {
  it('parses a valid human actor request', async () => {
    const { res, captured } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-id': 'ext-user-1',
      'x-krabiclaw-actor-kind': 'human',
    });
    expect(res.status).toBe(200);
    expect(captured).toEqual({
      externalOrganizationId: 'ext-org-1',
      externalActorId: 'ext-user-1',
      actorKind: 'human',
    });
  });

  it('parses a valid anonymous actor request with no actor id', async () => {
    const { captured } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-kind': 'anonymous',
    });
    expect(captured).toEqual({ externalOrganizationId: 'ext-org-1', externalActorId: null, actorKind: 'anonymous' });
  });

  it('rejects a missing organization id', async () => {
    const { res } = await contextFromHeaders({ 'x-krabiclaw-actor-kind': 'anonymous' });
    expect(res.status).toBe(400);
  });

  it('rejects an unrecognized actor kind', async () => {
    const { res } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-kind': 'staff',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a human actor kind with no actor id', async () => {
    const { res } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-kind': 'human',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an anonymous actor kind that also sends an actor id', async () => {
    const { res } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1',
      'x-krabiclaw-actor-id': 'ext-user-1',
      'x-krabiclaw-actor-kind': 'anonymous',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicated organization id header (arrives comma-joined)', async () => {
    const { res } = await contextFromHeaders({
      'x-krabiclaw-organization-id': 'ext-org-1, ext-org-2',
      'x-krabiclaw-actor-kind': 'anonymous',
    });
    expect(res.status).toBe(400);
  });

  it('propagates HTTPException with a 400 status', async () => {
    const app = new Hono();
    app.get('/', (c) => {
      try {
        parseFacadeHeaders(c);
        return c.text('ok');
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPException);
        expect((error as HTTPException).status).toBe(400);
        throw error;
      }
    });
    const res = await app.request('/', { headers: {} });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/modules/krabiclaw-integration/parse-facade-headers.test.ts`
Expected: FAIL — cannot find module `@/modules/krabiclaw-integration/middleware/parse-facade-headers`.

- [ ] **Step 3: Write the types file**

```typescript
// src/modules/krabiclaw-integration/types/facade-headers.types.ts
import type { KrabiClawActorKind } from '@/modules/krabiclaw-integration/types/identity.types';

export interface KrabiClawFacadeHeaders {
  externalOrganizationId: string;
  externalActorId: string | null;
  actorKind: KrabiClawActorKind;
}
```

- [ ] **Step 4: Write the header parser**

```typescript
// src/modules/krabiclaw-integration/middleware/parse-facade-headers.ts
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

import type { KrabiClawFacadeHeaders } from '@/modules/krabiclaw-integration/types/facade-headers.types';

const ORGANIZATION_HEADER = 'x-krabiclaw-organization-id';
const ACTOR_ID_HEADER = 'x-krabiclaw-actor-id';
const ACTOR_KIND_HEADER = 'x-krabiclaw-actor-kind';

const requireSingleHeader = (c: Context, name: string): string => {
  const value = c.req.header(name);
  if (!value || value.includes(',')) {
    throw new HTTPException(400, { message: `Missing or duplicated header: ${name}` });
  }
  return value;
};

const readOptionalSingleHeader = (c: Context, name: string): string | null => {
  const value = c.req.header(name);
  if (value === undefined) {
    return null;
  }
  if (value.includes(',')) {
    throw new HTTPException(400, { message: `Duplicated header: ${name}` });
  }
  return value;
};

export const parseFacadeHeaders = (c: Context): KrabiClawFacadeHeaders => {
  const externalOrganizationId = requireSingleHeader(c, ORGANIZATION_HEADER);
  const actorKindRaw = requireSingleHeader(c, ACTOR_KIND_HEADER);

  if (actorKindRaw !== 'human' && actorKindRaw !== 'anonymous') {
    throw new HTTPException(400, { message: `Invalid ${ACTOR_KIND_HEADER}: ${actorKindRaw}` });
  }

  const externalActorId = readOptionalSingleHeader(c, ACTOR_ID_HEADER);

  if (actorKindRaw === 'human' && !externalActorId) {
    throw new HTTPException(400, { message: `${ACTOR_ID_HEADER} is required when ${ACTOR_KIND_HEADER} is human` });
  }
  if (actorKindRaw === 'anonymous' && externalActorId) {
    throw new HTTPException(400, {
      message: `${ACTOR_ID_HEADER} must not be sent when ${ACTOR_KIND_HEADER} is anonymous`,
    });
  }

  return { externalOrganizationId, externalActorId, actorKind: actorKindRaw };
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run test/modules/krabiclaw-integration/parse-facade-headers.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/modules/krabiclaw-integration/types/facade-headers.types.ts src/modules/krabiclaw-integration/middleware/parse-facade-headers.ts test/modules/krabiclaw-integration/parse-facade-headers.test.ts
git commit -m "feat(krabiclaw-integration): add strict facade header parsing"
```

---

### Task 3: OAuth access-token verification

**Files:**

- Create: `src/modules/krabiclaw-integration/middleware/verify-facade-token.ts`
- Test: `test/modules/krabiclaw-integration/verify-facade-token.test.ts`

**Interfaces:**

- Consumes: `KRABICLAW_LEGAL_API_AUDIENCE`, `KRABICLAW_LEGAL_SCOPES` from `@/shared/auth/krabiclaw-oauth` (U1); `config.krabiclaw.oauthClientId`, `config.app.baseUrl` from `@/shared/config`; `verifyJwsAccessToken` from `better-auth/oauth2`.
- Produces: `verifyFacadeToken(token: string | undefined, authInstance: ReturnType<typeof createBetterAuthInstance>): Promise<{ clientId: string }>` — throws `HTTPException(401)` for missing/malformed/expired/wrong-audience/wrong-issuer/wrong-client tokens or a present `sub` claim, `HTTPException(403)` for a token missing every `legal:*` scope. Consumed by Task 4's middleware.

Verified empirically before writing this task (throwaway probe, discarded): Better Auth's M2M `client_credentials` tokens for this audience carry `aud`, `azp`, `scope`, `iss` (`${config.app.baseUrl}/api/auth`), `iat`, `exp` — no `sub`. `verifyJwsAccessToken` can fetch the JWKS in-process via `authInstance.api.getJwks()` (no network call), and copies `azp` onto `payload.client_id`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/modules/krabiclaw-integration/verify-facade-token.test.ts
import { describe, expect, it, vi } from 'vitest';

import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { KRABICLAW_LEGAL_API_AUDIENCE, KRABICLAW_LEGAL_SCOPES } from '@/shared/auth/krabiclaw-oauth';
import { verifyFacadeToken } from '@/modules/krabiclaw-integration/middleware/verify-facade-token';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';

const configState = vi.hoisted(() => ({ oauthClientId: undefined as string | undefined }));

// vi.mock calls are hoisted above every import in this file (including the
// static `verifyFacadeToken` import above), so the module under test always
// picks up this mocked config — no dynamic import needed.
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/modules/krabiclaw-integration/verify-facade-token.test.ts`
Expected: FAIL — cannot find module `@/modules/krabiclaw-integration/middleware/verify-facade-token`.

- [ ] **Step 3: Write the verifier**

```typescript
// src/modules/krabiclaw-integration/middleware/verify-facade-token.ts
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { verifyJwsAccessToken } from 'better-auth/oauth2';

import { KRABICLAW_LEGAL_API_AUDIENCE, KRABICLAW_LEGAL_SCOPES } from '@/shared/auth/krabiclaw-oauth';
import type { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { config } from '@/shared/config';

const logger = getLogger(['modules', 'krabiclaw-integration', 'verify-facade-token']);

// Stable identity so verifyJwsAccessToken's in-process JWKS fetch is cached
// across requests instead of calling authInstance.api.getJwks() every time.
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

  const payload = await verifyJwsAccessToken(token, {
    jwksFetch: () => authInstance.api.getJwks(),
    jwksCacheKey: JWKS_CACHE_KEY,
    verifyOptions: {
      audience: KRABICLAW_LEGAL_API_AUDIENCE,
      issuer: `${config.app.baseUrl}/api/auth`,
    },
  }).catch((error: unknown) => {
    logger.warn('krabiclaw facade token verification failed: {error}', { error });
    throw new HTTPException(401, { message: 'Invalid access token' });
  });

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/modules/krabiclaw-integration/verify-facade-token.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/krabiclaw-integration/middleware/verify-facade-token.ts test/modules/krabiclaw-integration/verify-facade-token.test.ts
git commit -m "feat(krabiclaw-integration): add in-process facade token verification"
```

---

### Task 4: Kill switch config

**Files:**

- Modify: `src/shared/config/index.ts`

**Interfaces:**

- Produces: `config.krabiclaw.facadeEnabled: boolean` (default `false`). Consumed by Task 5's middleware.

- [ ] **Step 1: Add the env field to the schema**

In `src/shared/config/index.ts`, in the same zod object as `KRABICLAW_OAUTH_CLIENT_ID`, add:

```typescript
    KRABICLAW_FACADE_ENABLED: z.enum(['true', 'false']).optional(),
```

- [ ] **Step 2: Add the derived boolean**

In the `krabiclaw` config block, add:

```typescript
  krabiclaw: {
    oauthClientId: raw.KRABICLAW_OAUTH_CLIENT_ID,
    facadeEnabled: raw.KRABICLAW_FACADE_ENABLED === 'true',
    d1AccountId: raw.CLOUDFLARE_D1_ACCOUNT_ID,
    d1DatabaseId: raw.CLOUDFLARE_D1_DATABASE_ID,
    d1ApiToken: raw.CLOUDFLARE_D1_API_TOKEN,
  },
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm run typecheck`
Expected: PASS — no test exists for this one-line config addition (mirrors `SKIP_CAPTCHA`'s existing untested boolean pattern); Task 5's middleware test exercises both `true` and `false` states.

- [ ] **Step 4: Commit**

```bash
git add src/shared/config/index.ts
git commit -m "feat(krabiclaw-integration): add default-off facade kill switch"
```

---

### Task 5: Composed facade middleware

**Files:**

- Modify: `src/shared/types/hono.ts`
- Create: `src/modules/krabiclaw-integration/types/legal-operation-context.types.ts`
- Create: `src/modules/krabiclaw-integration/middleware/krabiclaw-facade.middleware.ts`
- Test: `test/modules/krabiclaw-integration/krabiclaw-facade.middleware.test.ts`

**Interfaces:**

- Consumes: `parseFacadeHeaders` (Task 2), `verifyFacadeToken` (Task 3), `config.krabiclaw.facadeEnabled` (Task 4), `krabiclawDirectoryService` (U2), `krabiclawIdentityResolverService` (U3), `KrabiClawActorAttributed` (Task 1).
- Produces: `LegalOperationContext = { organizationId: string; userId: string | null }`; `Variables.legalOperationContext?: LegalOperationContext`; `krabiclawFacadeMiddleware(): MiddlewareHandler<AppContext>` — sets `legalOperationContext` on success, throws `HTTPException` (404 disabled, 401/403 from Task 3, 400 from Task 2, 502 on directory/resolver failure) otherwise. Consumed by Task 6's `http.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/modules/krabiclaw-integration/krabiclaw-facade.middleware.test.ts
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { krabiclawFacadeMiddleware } from '@/modules/krabiclaw-integration/middleware/krabiclaw-facade.middleware';
import { krabiclawDirectoryService } from '@/modules/krabiclaw-integration/services/krabiclaw-directory.service';
import { krabiclawIdentityResolverService } from '@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service';

const configState = vi.hoisted(() => ({ facadeEnabled: true, oauthClientId: 'fixed-client' }));

vi.mock('@/shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/config')>();
  return {
    config: {
      ...actual.config,
      krabiclaw: {
        ...actual.config.krabiclaw,
        get facadeEnabled() {
          return configState.facadeEnabled;
        },
        get oauthClientId() {
          return configState.oauthClientId;
        },
      },
    },
  };
});

vi.mock('@/modules/krabiclaw-integration/middleware/verify-facade-token', () => ({
  verifyFacadeToken: vi.fn(async () => ({ clientId: 'fixed-client' })),
}));

vi.mock('@/modules/krabiclaw-integration/services/krabiclaw-directory.service', () => ({
  krabiclawDirectoryService: {
    getOrganizationDirectoryRecord: vi.fn(async (id: string) => ({ id, name: 'Acme Legal', slug: 'acme-legal' })),
    getUserDirectoryRecord: vi.fn(async (id: string) => ({ id, name: 'Jane Roe', email: 'jane@example.test' })),
  },
}));

vi.mock('@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service', () => ({
  krabiclawIdentityResolverService: {
    resolveIdentity: vi.fn(async ({ actorKind }: { actorKind: string }) => ({
      organizationId: 'local-org-1',
      userId: actorKind === 'human' ? 'local-user-1' : null,
    })),
  },
}));

const dispatchMock = vi.hoisted(() => vi.fn(async () => 'event-id-1'));
vi.mock('@/shared/events/definitions/krabiclaw', () => ({
  KrabiClawActorAttributed: { dispatch: dispatchMock },
}));

const buildApp = () => {
  const app = new Hono();
  app.use('*', krabiclawFacadeMiddleware());
  app.get('/', (c) => c.json({ context: c.get('legalOperationContext') ?? null }));
  return app;
};

const humanHeaders = {
  authorization: 'Bearer token',
  'x-krabiclaw-organization-id': 'ext-org-1',
  'x-krabiclaw-actor-id': 'ext-user-1',
  'x-krabiclaw-actor-kind': 'human',
};

describe('krabiclawFacadeMiddleware', () => {
  it('returns 404 when the facade kill switch is off', async () => {
    configState.facadeEnabled = false;
    const res = await buildApp().request('/', { headers: humanHeaders });
    expect(res.status).toBe(404);
    configState.facadeEnabled = true;
  });

  it('sets an auth-independent LegalOperationContext for a human actor', async () => {
    const res = await buildApp().request('/', { headers: humanHeaders });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { context: unknown };
    expect(body.context).toEqual({ organizationId: 'local-org-1', userId: 'local-user-1' });
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ actor_kind: 'human', resolved_user_id: 'local-user-1' }),
      expect.objectContaining({ actorId: 'local-user-1', organizationId: 'local-org-1' })
    );
  });

  it('sets a null userId for an anonymous actor and never asks the directory for a user record', async () => {
    vi.mocked(krabiclawDirectoryService.getUserDirectoryRecord).mockClear();

    const res = await buildApp().request('/', {
      headers: {
        authorization: 'Bearer token',
        'x-krabiclaw-organization-id': 'ext-org-1',
        'x-krabiclaw-actor-kind': 'anonymous',
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { context: unknown };
    expect(body.context).toEqual({ organizationId: 'local-org-1', userId: null });
    expect(krabiclawDirectoryService.getUserDirectoryRecord).not.toHaveBeenCalled();
  });

  it('rejects malformed headers before ever verifying the token', async () => {
    const res = await buildApp().request('/', { headers: { authorization: 'Bearer token' } });
    expect(res.status).toBe(400);
  });

  it('never sets legalOperationContext on a route outside the facade middleware', async () => {
    const plainApp = new Hono();
    plainApp.get('/', (c) => c.json({ context: c.get('legalOperationContext') ?? null }));
    const res = await plainApp.request('/');
    const body = (await res.json()) as { context: unknown };
    expect(body.context).toBeNull();
  });

  it('passes actor kind through to the identity resolver rather than re-deriving it', async () => {
    vi.mocked(krabiclawIdentityResolverService.resolveIdentity).mockResolvedValueOnce({
      organizationId: 'local-org-2',
      userId: null,
    });
    const res = await buildApp().request('/', { headers: humanHeaders });
    const body = (await res.json()) as { context: { userId: string | null } };
    // The resolver, not the middleware, decides userId — this proves the middleware
    // passes actorKind through rather than re-deriving it.
    expect(body.context.userId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/modules/krabiclaw-integration/krabiclaw-facade.middleware.test.ts`
Expected: FAIL — cannot find module `@/modules/krabiclaw-integration/middleware/krabiclaw-facade.middleware`.

- [ ] **Step 3: Write the LegalOperationContext type**

```typescript
// src/modules/krabiclaw-integration/types/legal-operation-context.types.ts
export interface LegalOperationContext {
  organizationId: string;
  userId: string | null;
}
```

- [ ] **Step 4: Add it to the shared Hono Variables**

In `src/shared/types/hono.ts`, add the import and field:

```typescript
import type { LegalOperationContext } from '@/modules/krabiclaw-integration/types/legal-operation-context.types';
```

```typescript
export interface Variables {
  user: User | null;
  session: Session | null;
  userId: string | null;
  apiKeyId: string | null;
  activeOrganizationId: string | null;
  memberRole: string | null;
  ability: AppAbility;
  legalOperationContext?: LegalOperationContext;
}
```

- [ ] **Step 5: Write the composed middleware**

```typescript
// src/modules/krabiclaw-integration/middleware/krabiclaw-facade.middleware.ts
import { getLogger } from '@logtape/logtape';
import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { parseFacadeHeaders } from '@/modules/krabiclaw-integration/middleware/parse-facade-headers';
import { verifyFacadeToken } from '@/modules/krabiclaw-integration/middleware/verify-facade-token';
import { krabiclawDirectoryService } from '@/modules/krabiclaw-integration/services/krabiclaw-directory.service';
import { krabiclawIdentityResolverService } from '@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service';
import type { KrabiClawFacadeHeaders } from '@/modules/krabiclaw-integration/types/facade-headers.types';
import type { KrabiClawResolvedIdentity } from '@/modules/krabiclaw-integration/types/identity.types';
import { KrabiClawActorAttributed } from '@/shared/events/definitions/krabiclaw';
import { config } from '@/shared/config';
import { db } from '@/shared/database';
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

export const krabiclawFacadeMiddleware = (): MiddlewareHandler<AppContext> => {
  const authInstance = createBetterAuthInstance(db);

  return async (c, next) => {
    if (!config.krabiclaw.facadeEnabled) {
      throw new HTTPException(404, { message: 'Not found' });
    }

    const headers = parseFacadeHeaders(c);
    const token = extractBearerToken(c.req.header('authorization'));
    const { clientId } = await verifyFacadeToken(token, authInstance);
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
};
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run test/modules/krabiclaw-integration/krabiclaw-facade.middleware.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/hono.ts src/modules/krabiclaw-integration/types/legal-operation-context.types.ts src/modules/krabiclaw-integration/middleware/krabiclaw-facade.middleware.ts test/modules/krabiclaw-integration/krabiclaw-facade.middleware.test.ts
git commit -m "feat(krabiclaw-integration): add composed facade middleware"
```

---

### Task 6: Mount the (still routeless) module

**Files:**

- Create: `src/modules/krabiclaw-integration/http.ts`
- Test: `test/modules/krabiclaw-integration/http.test.ts`

**Interfaces:**

- Consumes: `krabiclawFacadeMiddleware` (Task 5), the existing `rateLimit` from `@/shared/middleware/rateLimit`, `createHonoApp` from `@/shared/router/factory`.
- Produces: default-exported Hono app, `export const mountPath = '/api/integrations/krabiclaw/v1'`. This is what `scripts/codegen.ts` requires to exist for every non-excluded module — it currently fails on this exact `ENOENT` for both the U2 and U3 baselines; this task is what fixes `pnpm run build`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/modules/krabiclaw-integration/http.test.ts
import { describe, expect, it, vi } from 'vitest';

import krabiclawIntegrationApp, { mountPath } from '@/modules/krabiclaw-integration/http';

const configState = vi.hoisted(() => ({ facadeEnabled: false }));

vi.mock('@/shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/config')>();
  return {
    config: {
      ...actual.config,
      krabiclaw: {
        ...actual.config.krabiclaw,
        get facadeEnabled() {
          return configState.facadeEnabled;
        },
      },
    },
  };
});

describe('krabiclaw-integration http.ts', () => {
  it("exports the route scope table's base path as its mount path", () => {
    expect(mountPath).toBe('/api/integrations/krabiclaw/v1');
  });

  it('404s every path while the kill switch is off, proving no route is reachable yet', async () => {
    const res = await krabiclawIntegrationApp.request('/practice/details', {
      headers: {
        authorization: 'Bearer token',
        'x-krabiclaw-organization-id': 'ext-org-1',
        'x-krabiclaw-actor-kind': 'anonymous',
      },
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/modules/krabiclaw-integration/http.test.ts`
Expected: FAIL — cannot find module `@/modules/krabiclaw-integration/http`.

- [ ] **Step 3: Write http.ts**

```typescript
// src/modules/krabiclaw-integration/http.ts
import { krabiclawFacadeMiddleware } from '@/modules/krabiclaw-integration/middleware/krabiclaw-facade.middleware';
import { rateLimit } from '@/shared/middleware/rateLimit';
import { createHonoApp } from '@/shared/router/factory';

const app = createHonoApp();

app.use(
  '*',
  krabiclawFacadeMiddleware(),
  rateLimit({
    routeKey: 'krabiclaw-facade',
    scope: (c) => {
      const context = c.get('legalOperationContext');
      return context ? `org:${context.organizationId}` : null;
    },
  })
);

// No routes yet — U8 mounts the Route Scope table's handlers here.

export const mountPath = '/api/integrations/krabiclaw/v1';
export default app;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/modules/krabiclaw-integration/http.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify the pre-existing build failure is fixed**

Run: `pnpm run build`
Expected: PASS — the `ENOENT ... krabiclaw-integration/http.ts` codegen failure from the U2/U3 baselines is gone. (If other, unrelated codegen/build errors appear, verify they reproduce on `origin/staging` before treating them as this task's responsibility.)

- [ ] **Step 6: Commit**

```bash
git add src/modules/krabiclaw-integration/http.ts test/modules/krabiclaw-integration/http.test.ts
git commit -m "feat(krabiclaw-integration): mount the facade middleware with no routes yet"
```

---

### Task 7: Full verification and PR

**Files:** none (verification only).

- [ ] **Step 1: Run the full validation suite**

```bash
pnpm run typecheck
pnpm run format:check
pnpm run lint
pnpm run build
```

Expected: all exit 0. `pnpm run lint` will still show the pre-existing baseline errors documented in U3's PR (#420) in files this unit never touches (`invoices/index.ts`, `onboarding/index.ts`, `practice/index.ts`, `practice-client-intakes/index.ts`) — confirm none of the reported findings are in a file this unit created or modified before treating the run as clean.

- [ ] **Step 2: Run focused tests for everything this unit touches**

```bash
pnpm exec vitest run test/shared/events/krabiclaw-actor-attributed.test.ts test/modules/krabiclaw-integration/
```

Expected: all pass. Also run `pnpm exec vitest run test/shared/` once broadly, since Task 5 modified the shared `Variables` type — confirm no shared-middleware test regresses.

- [ ] **Step 3: Review the full diff for scope**

Run: `git diff feat/krabiclaw-u3-identity-links...HEAD --stat`
Expected: only the files from Tasks 1–6, plus `src/shared/types/hono.ts` and `src/shared/config/index.ts` (both narrow, additive changes). No route handler, no D1 write, no Legal Operation code.

- [ ] **Step 4: Push and open the PR**

First re-check `gh pr view 419` / `gh pr view 420` — if either merged while this unit was in progress, retarget before pushing (mirror the fix already applied once to #420: `gh pr edit <number> --base <new-base>`).

```bash
git push -u origin feat/krabiclaw-u4-integration-adapter
gh pr create --base feat/krabiclaw-u3-identity-links --title "feat(krabiclaw-integration): add trusted integration adapter" --body "$(cat <<'EOF'
## Summary
- Add in-process OAuth access-token verification for KrabiClaw's machine `client_credentials` token (audience, issuer, no-`sub`, fixed-`azp`, `legal:*` scope) — no network round trip, verified via Better Auth's own in-process JWKS API.
- Add strict single-value facade header parsing (`X-Krabiclaw-Organization-Id`, `X-Krabiclaw-Actor-Id`, `X-Krabiclaw-Actor-Kind`) that rejects duplicated/malformed/inconsistent headers.
- Compose both into `krabiclawFacadeMiddleware`, which resolves external IDs to local UUID anchors (U3), builds an auth-independent `LegalOperationContext`, persists an immutable audit event, and is gated by a default-off kill switch (`KRABICLAW_FACADE_ENABLED`).
- Mount the middleware on `src/modules/krabiclaw-integration/http.ts` at `/api/integrations/krabiclaw/v1` — zero real routes yet (U8's job); every path 404s. This also fixes the pre-existing `pnpm run build` `ENOENT` failure that has existed on the U2 and U3 baselines since this module had no `http.ts`.

Implements U4 of `docs/plans/2026-08-08-001-feat-krabiclaw-legal-facade-plan.md` (R7, R20, R39, R47; KTD17, KTD22). R39 (owner/admin-only) is enforced on KrabiClaw's side per R1 — Blawby's adapter has no role data to check (KTD22, KTD5). Stacked on #418/#419/#420.

## Test plan
- [x] `pnpm run typecheck`
- [x] `pnpm run format:check`
- [x] `pnpm run lint` (pre-existing baseline errors only, none in touched files)
- [x] `pnpm run build` (fixes the pre-existing ENOENT)
- [x] Focused `vitest run` across every file this PR touches
- [x] Real-token tests cover: valid token accepted, missing/malformed token rejected, wrong fixed-client `azp` rejected, missing `legal:*` scope rejected (403)
- [x] Middleware tests cover: kill switch off → 404, human actor → resolved context + audit dispatch, anonymous actor → null userId and no user directory lookup, malformed headers rejected before token verification runs, a route outside this middleware never sees `legalOperationContext`
EOF
)"
```

- [ ] **Step 5: Update memory**

After the PR is open, update `project_krabiclaw_legal_facade_progress.md`: mark U4 done with its PR number/branch, note the JWKS-in-process verification technique and the header contract for U5+ to reuse, and note U5 (practice/Connect operations) is next.
