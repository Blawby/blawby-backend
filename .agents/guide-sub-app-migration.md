# Guide: Migrating a Module to Explicit Sub-App Auth

> Reference for migrating any module from `routes.config.ts` middleware to explicit Hono sub-apps in `http.ts`.
> See `plan-sub-app-migration.md` for the full migration plan and module inventory.

---

## Why

Old pattern: auth rules live in `routes.config.ts` → codegen compiles them → module-router applies them via path-to-regexp at runtime. Fragile, config-driven, hard to trace.

New pattern: auth rules live in `http.ts` as explicit Hono sub-apps. Visible, code-driven, impossible to misconfigure via pattern matching.

---

## Rule: Middleware Order

**Always in this order — never out of order:**

```
requireAuth()  →  requireOrgMembership()  →  injectAbility()
```

- `requireAuth` sets `userId` in context
- `requireOrgMembership` sets `organizationId` and fetches membership
- `injectAbility` reads `userId` + `organizationId` to build CASL ability — **must run last**

`injectAbility` without prior auth sets anonymous ability. That is intentional for public routes.
`injectAbility` before auth on an authenticated route = stale anonymous ability = CASL 403s.

---

## Pattern A — Uniform protected module

Use when: all routes require the same auth (e.g. `requireAuth + requireOrgMembership`).

**Before** (`routes.config.ts`):
```typescript
export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['requireAuth', 'requireOrgMembership'],
  },
};
```

**After** (`http.ts`):
```typescript
import { handlers } from '@/modules/<name>/handlers';
import { routes } from '@/modules/<name>/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';

const app = createHonoApp();
app.use('*', requireAuth(), requireOrgMembership(), injectAbility());

app.openapi(routes.someRoute, handlers.someHandler);
// ... rest of routes

export default app;
```

Then delete `routes.config.ts`.

**Variant — auth only (no org membership required):**
```typescript
app.use('*', requireAuth(), injectAbility());
```

---

## Pattern B — Fully public module

Use when: no routes require auth (webhooks, public info, dev utilities).

```typescript
const app = createHonoApp();
app.use('*', injectAbility()); // anonymous ability — safe, handlers don't CASL-check

app.openapi(routes.someRoute, handlers.someHandler);

export default app;
```

Note: modules that do their own auth (custom header, Stripe signature) still use this pattern.
Auth happens inside the handler/service, not middleware. `injectAbility` sets anonymous ability — fine.

---

## Pattern C — Mixed access module

Use when: some routes are public, some require auth, some require org membership.

Split into sub-apps. Each sub-app owns its auth chain. Mount all onto a parent app.

```typescript
import { createHonoApp } from '@/shared/router/factory';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';

const app = createHonoApp();

// Public routes — no auth
const publicApp = createHonoApp();
publicApp.use('*', injectAbility());
publicApp.openapi(routes.publicRoute, handlers.publicHandler);

// Authenticated routes — auth but no org membership
const clientApp = createHonoApp();
clientApp.use('*', requireAuth(), injectAbility());
clientApp.openapi(routes.clientRoute, handlers.clientHandler);

// Staff routes — org membership required
const staffApp = createHonoApp();
staffApp.use('*', requireAuth(), requireOrgMembership(), injectAbility());
staffApp.openapi(routes.staffRoute, handlers.staffHandler);

// Mount order matters: specific paths first, wildcard last
app.route('/staff', staffApp); // path prefix → all staffApp routes get /staff prepended
app.route('/', clientApp);
app.route('/', publicApp);

export default app;
```

### Mount path prefix

`app.route('/staff', staffApp)` prepends `/staff` to all route paths defined in `staffApp`.
So `staffApp` route `/{practice_id}` becomes `/staff/{practice_id}` on the parent.

**Remove any prefix from route definitions** — the mount provides it:
```typescript
// Wrong: route definition has /staff/ already
path: '/staff/{practice_id}'

// Correct: route definition is clean, mount adds /staff
path: '/{practice_id}'
// mounted at app.route('/staff', staffApp) → resolves to /staff/{practice_id}
```

### Choosing sub-app boundaries

| Routes needing | Sub-app middleware |
|---|---|
| No auth (public users) | `injectAbility()` |
| Logged-in users, no org | `requireAuth(), injectAbility()` |
| Org members (staff) | `requireAuth(), requireOrgMembership(), injectAbility()` |

If two groups have same auth level but different paths, they can share one sub-app.

---

## Checklist per module

- [ ] Identify each route's auth requirement (read handler + service for CASL checks)
- [ ] Assign each route to a sub-app tier (public / client / staff)
- [ ] Write sub-apps in `http.ts` with correct middleware order
- [ ] For Pattern C: remove any `/staff/` prefix from route definitions that the mount path now provides
- [ ] Delete `routes.config.ts`
- [ ] Run `pnpm run typecheck` — no errors
- [ ] Run `pnpm run build` — build succeeds, module appears in mount log
- [ ] Test: unauthenticated request to protected route → 401 (not 403, not 500)
- [ ] Test: authenticated non-member request to staff route → 401/403
- [ ] Test: public route → 200 without session cookie

---

## Common mistakes

**injectAbility on parent app**

```typescript
// Wrong: ability built before auth runs
const app = createHonoApp();
app.use('*', injectAbility()); // userId not set yet → anonymous ability for everyone
```

Fix: move `injectAbility()` inside each sub-app, after its auth middleware.

**Prefix in route definition AND in mount**

```typescript
// Wrong: double prefix
staffApp.openapi({ path: '/staff/{id}' }, handler);
app.route('/staff', staffApp);
// Resolves to: /staff/staff/{id}
```

Fix: route definition has `/{id}`, mount adds `/staff`.

**Mounting public last**

```typescript
// Fine — Hono matches by route, not middleware registration order
app.route('/', clientApp);
app.route('/staff', staffApp);
app.route('/', publicApp);
```

Hono sub-app routing is path-based, not first-match-wins for middleware. Mount order doesn't affect which sub-app handles a request — the route registration determines that.

**Forgetting injectAbility on public routes**

`getServiceContext(c)` reads `c.get('ability')` raw — no fallback. If never set, `ctx.ability` is `undefined`. Any service that calls `ctx.ability.can(...)` without a memberRole guard crashes with a 500.

Always add `injectAbility()` even on public sub-apps.

---

## routes.config.ts → http.ts mapping reference

| routes.config.ts pattern | http.ts equivalent |
|---|---|
| `'*': ['requireAuth', 'requireOrgMembership']` | `app.use('*', requireAuth(), requireOrgMembership(), injectAbility())` |
| `'*': ['requireAuth']` | `app.use('*', requireAuth(), injectAbility())` |
| `'*': ['public']` | `app.use('*', injectAbility())` |
| `'GET /foo': ['requireAuth']` + `'*': ['requireAuth', 'requireOrgMembership']` | Split into two sub-apps |
| `prefix: '/'` | `export const mountPath = '/'` in http.ts (build script reads this) |
