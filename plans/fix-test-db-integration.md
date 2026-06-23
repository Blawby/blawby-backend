# Fix Test Database Integration

> Archived historical plan. Do not execute directly without first verifying every relevant claim against current code. See `docs/PRIORITY.md` for current work ordering.

## Context

All tests currently mock the database, services, and events because importing `hono-app.ts` triggers top-level `await bootApplication()` and `await registerModuleRoutes()`, which initialize the full app (DB, rate limiter, workers, event listeners). The test helpers (`db.ts`, `auth.ts`, `factories.ts`) were built for real DB integration but are unused.

The good news: `db` and `stripe` are lazy proxies that only connect on first property access. Individual module `http.ts` files (e.g., `matters/http.ts`) can be imported safely — they just register routes and handlers without triggering connections. So we can mount module apps directly in tests, bypassing the full boot.

## Approach

Create a lightweight test harness that mounts individual module apps with a fake auth middleware (injects `user` context), pointed at the real test database. No mocking of DB, queries, or services.

### Files to modify

1. **`test/helpers/db.ts`** — Fix to use `.env.test` DATABASE_URL and export both the pool and a typed Drizzle instance. Add `cleanupDb()` that truncates all tables (cascading) between tests, and `closeDb()` for teardown.

2. **`test/helpers/app.ts`** — Replace the `import app from '@/hono-app'` (which triggers full boot) with a `createTestApp(moduleApp)` factory that:
   - Creates a fresh `Hono<AppContext>`
   - Adds a middleware that injects a fake `user`/`session`/`activeOrganizationId` into context (bypassing Better Auth entirely)
   - Mounts the module app at the correct prefix
   - Returns it for direct `app.request()` calls (no supertest needed)

3. **`test/helpers/auth.ts`** — Simplify to create real DB records for test users/orgs using Drizzle insert (not Better Auth SDK). Better Auth SDK requires the full auth instance with DB hooks, email sending, etc. — too heavy for tests. Direct inserts into `users`, `organizations`, `members` tables are sufficient.

4. **`test/helpers/factories.ts`** — Flesh out with real factory functions that create matters, invoices, etc. using Drizzle inserts with `@faker-js/faker` for data generation.

5. **`test/helpers/request.ts`** — Remove supertest adapter. Replace with a thin wrapper around Hono's built-in `app.request()` which returns a standard `Response`.

6. **`test/setup/globalSetup.ts`** — Keep the drop/create/migrate logic (it works). Add missing `globalTeardown` reference in vitest config.

7. **`test/setup/setupFiles.ts`** — Load `.env.test`, then import `getTestDb` to ensure the pool is warmed up. Add `afterEach` hook calling `cleanupDb()` to truncate tables between tests. Add `afterAll` hook calling `closeDb()`.

8. **`vitest.config.ts`** — Add `globalTeardown` reference. Set `pool: 'forks'` to isolate test files. Set `fileParallelism: false` for DB tests (parallel writes to same tables cause flakes).

9. **`test/modules/matters/matters.test.ts`** — Rewrite as the reference integration test:
   - Use `createTestApp(mattersApp)`
   - Create real user + org + membership in DB via helpers
   - POST to create a matter → assert 201 + matter exists in DB
   - GET to list matters → assert returned data matches
   - No mocks at all

### Files to delete
- `test/tsconfig.test.json` — redundant with `test/tsconfig.json`

### Files to keep as-is
- `vitest.unit.config.ts` — for pure unit tests that don't need DB
- `test/setup/globalTeardown.ts` — already correct

## Key design decisions

- **No supertest** — Hono's `app.request('/path', { method: 'POST', body: ... })` is simpler, doesn't need the `getRequestListener` hack, and returns standard Fetch `Response`.
- **No Better Auth in tests** — Direct DB inserts for users/sessions. The auth middleware is replaced with a test middleware that injects the user context directly.
- **Truncate, don't drop/recreate** — `globalSetup` creates the DB once per test run. Between each test, `TRUNCATE ... CASCADE` is fast and resets state.
- **`pool: 'forks'`** with `fileParallelism: false` — Each test file gets its own process (clean globals) but files run sequentially to avoid DB contention.

## Verification

1. `pnpm test` should:
   - Create `blawby_test` database
   - Run migrations
   - Execute integration tests against real Postgres
   - Drop the test database on teardown
2. The rewritten `matters.test.ts` should create a real matter in the DB and retrieve it — no mocks.
3. `pnpm test -- --config vitest.unit.config.ts` should still run pure unit tests without DB.
