# Backend testing guide

Status: current
Last verified: 2026-07-14

## Test layers

- Pure unit tests use `vitest.unit.config.ts`. They do not start PostgreSQL or run global database setup.
- Database-backed module integration tests use `vitest.config.ts`. They exercise real Drizzle queries, Better Auth records, middleware, and Hono module routes.
- Full-application tests are reserved for behavior that depends on cross-module bootstrapping. A module test should not import `hono-app.ts` when mounting one module is sufficient.

## Database lifecycle and prerequisites

Database-backed tests require:

- a local PostgreSQL server reachable at `127.0.0.1:5432`;
- a local ignored `.env.test` containing `DATABASE_URL` for a database named `blawby_test`; and
- PostgreSQL credentials that may create and drop that test database.

Global setup refuses any `DATABASE_URL` that does not contain `blawby_test`, drops and recreates that database, then applies the committed Drizzle migrations. Global teardown terminates remaining test connections and drops the test database. This run-level recreation is the isolation boundary; tests must still create their own records and must not depend on test ordering.

Never commit `.env.test`, database credentials, auth cookies, or provider keys.

## Helpers

- `test/helpers/db.ts` exposes lazy, typed Drizzle and Pool access through `getTestDb()` and `getTestPool()`.
- `test/helpers/auth.ts` creates real Better Auth users, sessions, organizations, and memberships.
- `test/helpers/module-app.ts` creates a lightweight public, authenticated, or organization-protected Hono host. Mount one module with `app.route()`.
- `test/helpers/request.ts` adapts a Hono fetch handler to Supertest and applies complete Better Auth cookie strings.

Example module integration host:

```ts
const app = createModuleTestApp();
app.route('/api/trust', trustApp);

const request = createRequest(app.fetch);
const authedRequest = createAuthenticatedRequest(app.fetch, sessionCookie);
```

`test/modules/trust/trust-reports.test.ts` is the reference real-database module test: it mounts only the trust module, creates real auth/organization/client/ledger state, and verifies authenticated HTTP responses.

## HTTP request choice

Keep Supertest for integration tests because the existing response helpers, cookie handling, and suites use its assertion model. Use Hono `app.request()` for small pure tests where no Supertest behavior is needed. Do not migrate working tests merely to change request syntax.

## Commands

```bash
pnpm test test/modules/trust/trust-reports.test.ts
pnpm vitest run --config vitest.unit.config.ts test/helpers/module-app.test.ts
```

Run the smallest relevant suite first. Full database-backed runs recreate `blawby_test` and are intentionally heavier than unit runs.
