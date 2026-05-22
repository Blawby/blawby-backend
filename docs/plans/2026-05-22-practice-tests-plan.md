# Plan: practice.test.ts

**Origin:** docs/brainstorms/2026-05-22-test-suite-practices-contracts-intakes-requirements.md
**File to create:** `test/modules/practice/practice.test.ts`

## Key technical decisions

- Mount `practiceApp` (from `src/modules/practice/http.ts`) isolated — same pattern as `intakes.test.ts`
- `practiceApp.use('*', injectAbility())` only — no auth middleware. Must wrap manually.
- Use `authHelpers.createTestContext('owner')` for authenticated context.
- `POST /` and `GET /list` require auth only (no org). All other routes require auth + org membership per `routes.config.ts`.

## App wiring

```typescript
import { Hono } from 'hono';
import practiceApp from '@/modules/practice/http';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createRequest, createAuthenticatedRequest } from '@/test/helpers/request';

// auth only (POST /, GET /list)
const authApp = new Hono();
authApp.use('/api/*', requireAuth());
authApp.route('/api/practice', practiceApp);

// auth + org (GET/PUT/DELETE /{practice_id})
const orgApp = new Hono();
orgApp.use('/api/*', requireAuth());
orgApp.use('/api/*', requireOrgMembership());
orgApp.route('/api/practice', practiceApp);

const publicRequest = createRequest(authApp.fetch); // for unauthenticated 401 tests
const authRequest = createRequest(authApp.fetch);
const orgRequest = createRequest(orgApp.fetch);
```

## Test scenarios

### Setup
```typescript
let sessionToken: string;
let practiceId: string;

beforeAll(async () => {
  const ctx = await authHelpers.createTestContext('owner');
  sessionToken = ctx.sessionToken;
});
```

### Scenarios

| # | Scenario | Helper | Path | Expected |
|---|---|---|---|---|
| 1 | List practices — authenticated | `createAuthenticatedRequest(authApp.fetch, sessionToken)` | `GET /api/practice/list` | 200, body is array |
| 2 | Create practice | `createAuthenticatedRequest(authApp.fetch, sessionToken)` | `POST /api/practice` | 201, body has `id`, `name` |
| 3 | Get practice — owner | `createAuthenticatedRequest(orgApp.fetch, sessionToken)` | `GET /api/practice/{id}` | 200, body has `id` |
| 4 | Update practice — owner | `createAuthenticatedRequest(orgApp.fetch, sessionToken)` | `PUT /api/practice/{id}` | 200, updated `name` |
| 5 | Delete practice — owner | `createAuthenticatedRequest(orgApp.fetch, sessionToken)` | `DELETE /api/practice/{id}` | 204 |
| 6 | Get practice — unauthenticated | `publicRequest` (no cookie) | `GET /api/practice/{id}` | 401 |
| 7 | Get practice — wrong org | second org's `sessionToken` via `createTestContext` | `GET /api/practice/{id}` | 403 |
| 8 | Get practice — not found | owner session, random UUID | `GET /api/practice/{uuid}` | 404 |

**Note on scenario 2:** Save the returned `id` as `practiceId` for use in scenarios 3–8.

**Note on scenario 7:** Call `authHelpers.createTestContext('owner')` a second time to get a second org session. That session token has no membership in the first org.

**Note on scenario 5:** Delete in a nested `describe` or last — deleting the practice invalidates the ID for later tests.

## Verification

- `pnpm test test/modules/practice/practice.test.ts` passes
- `pnpm run typecheck` passes
