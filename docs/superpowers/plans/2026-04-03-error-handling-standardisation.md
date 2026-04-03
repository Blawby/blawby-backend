# Error Handling Standardisation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom `createAppError`/`createNotFoundError`/`createValidationError` pattern (plain object throws, lost stack traces) with `HTTPException` (real Error subclass) everywhere, and add normalisation utilities for Stripe and DB exceptions.

**Architecture:** Three-step migration — (1) create `wrapStripeError` and `wrapDbError` utilities, (2) convert all custom error throws to `HTTPException`/`new Error` across 10 files, (3) delete `src/shared/types/errors.ts`. All changes are mechanical find-and-replace with clear mapping rules. No new behaviour introduced.

**Tech Stack:** TypeScript, Hono (`HTTPException` from `hono/http-exception`), Stripe SDK, Drizzle/pg, LogTape

---

## Conversion Rules

These rules apply uniformly across every file in scope:

| Old pattern | New pattern | HTTP status |
|---|---|---|
| `throw createNotFoundError('CODE', 'msg', ctx?)` | `throw new HTTPException(404, { message: 'msg' })` | 404 |
| `throw createValidationError('CODE', 'msg', ctx?)` | `throw new HTTPException(400, { message: 'msg' })` | 400 |
| `throw createAppError('CODE', 'msg', 400, ctx?)` | `throw new HTTPException(400, { message: 'msg' })` | 400 |
| `throw createAppError('CODE', 'msg', 401, ctx?)` | `throw new HTTPException(401, { message: 'msg' })` | 401 |
| `throw createAppError('CODE', 'msg', 403, ctx?)` | `throw new HTTPException(403, { message: 'msg' })` | 403 |
| `throw createAppError('CODE', 'msg', 404, ctx?)` | `throw new HTTPException(404, { message: 'msg' })` | 404 |
| `throw createAppError('CODE', 'msg', 409, ctx?)` | `throw new HTTPException(409, { message: 'msg' })` | 409 |
| `throw createAppError('CODE', 'msg', 422, ctx?)` | `throw new HTTPException(422, { message: 'msg' })` | 422 |
| `throw createAppError('CODE', 'msg', 500, ctx?)` | `throw new Error('msg')` | 500 |
| `throw createTransactionError('CODE', 'msg', ctx?)` | `throw new Error('msg')` | 500 |

Also remove all `'kind' in error` re-throw guards — they only exist to propagate the custom error shape:
```typescript
// Remove these blocks entirely:
if (error && typeof error === 'object' && 'kind' in error) {
  throw error;
}
```

In every file that currently imports from `@/shared/types/errors`:
- Remove the import line
- Add `import { HTTPException } from 'hono/http-exception';` if not already present

---

## File Map

| Action | File |
|---|---|
| Create | `src/shared/utils/stripe-error.ts` |
| Create | `src/shared/utils/db-error.ts` |
| Convert | `src/engines/financial/refund-engine.ts` |
| Convert | `src/engines/financial/refund-reconciliation.ts` |
| Convert | `src/engines/financial/fund-management.ts` |
| Convert | `src/engines/stripe/stripe-api-adapter.ts` |
| Convert | `src/modules/invoices/services/invoice-stripe-coordination.service.ts` |
| Convert | `src/modules/invoices/services/refund-requests.service.ts` |
| Convert | `src/modules/invoices/services/invoice-lifecycle.service.ts` |
| Convert | `src/modules/invoices/services/invoice-client-resolver.service.ts` |
| Convert | `src/modules/invoices/services/invoice-queries.service.ts` |
| Convert | `src/modules/invoices/services/invoice-creation.service.ts` |
| Delete | `src/shared/types/errors.ts` |

---

## Task 1: Create `wrapStripeError` and `wrapDbError` utilities

**Files:**
- Create: `src/shared/utils/stripe-error.ts`
- Create: `src/shared/utils/db-error.ts`

- [ ] **Create `src/shared/utils/stripe-error.ts`**:

```typescript
import { Stripe } from 'stripe';
import { HTTPException } from 'hono/http-exception';

/**
 * Normalise a caught Stripe error into the project's throw-based error convention.
 * - Card errors → 422 (safe to surface to user)
 * - Invalid request → 500 Error (our bug, don't expose internals)
 * - Transient (connection/rate limit) → 500 Error (Graphile Worker will retry)
 * - Auth failure → 500 Error (critical — bad API key)
 * - All others → 500 Error
 *
 * Usage: catch (err) { wrapStripeError(err); }
 */
export const wrapStripeError = (err: unknown): never => {
  if (err instanceof Stripe.errors.StripeCardError) {
    throw new HTTPException(422, { message: err.message });
  }
  if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    throw new Error(`Stripe invalid request: ${err.message}`);
  }
  if (
    err instanceof Stripe.errors.StripeConnectionError ||
    err instanceof Stripe.errors.StripeRateLimitError
  ) {
    throw new Error(`Stripe transient error: ${err.message}`);
  }
  if (err instanceof Stripe.errors.StripeAuthenticationError) {
    throw new Error('Stripe authentication failure — check API key');
  }
  throw new Error(err instanceof Error ? err.message : 'Unknown Stripe error');
};
```

- [ ] **Create `src/shared/utils/db-error.ts`**:

```typescript
import { HTTPException } from 'hono/http-exception';

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_SERIALIZATION_FAILURE = '40001';

/**
 * Normalise a caught Drizzle/pg error into the project's throw-based error convention.
 * - Unique violation (23505) → 409 Conflict
 * - Foreign key violation (23503) → 400 Bad Request
 * - Serialization failure (40001) → 500 Error (Graphile Worker will retry)
 * - All others → 500 Error
 *
 * Usage: catch (err) { wrapDbError(err); }
 */
export const wrapDbError = (err: unknown): never => {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: string }).code;
    if (code === PG_UNIQUE_VIOLATION) {
      throw new HTTPException(409, { message: 'Resource already exists' });
    }
    if (code === PG_FOREIGN_KEY_VIOLATION) {
      throw new HTTPException(400, { message: 'Invalid reference — related resource not found' });
    }
    if (code === PG_SERIALIZATION_FAILURE) {
      throw new Error('Database serialization failure — retry');
    }
  }
  throw new Error(err instanceof Error ? err.message : 'Unknown database error');
};
```

- [ ] **Run typecheck**

```bash
pnpm run typecheck
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/shared/utils/stripe-error.ts src/shared/utils/db-error.ts
git commit -m "feat(shared/utils): add wrapStripeError and wrapDbError normalisation utilities"
```

---

## Task 2: Convert engine files

**Files:**
- Modify: `src/engines/financial/refund-engine.ts`
- Modify: `src/engines/financial/refund-reconciliation.ts`
- Modify: `src/engines/financial/fund-management.ts`
- Modify: `src/engines/stripe/stripe-api-adapter.ts`

Read each file before editing. Apply the conversion rules from the table at the top of this plan.

- [ ] **`src/engines/financial/refund-engine.ts`** — currently uses `createNotFoundError`. Convert per rules. Remove `@/shared/types/errors` import. Add `import { HTTPException } from 'hono/http-exception';`.

- [ ] **`src/engines/financial/refund-reconciliation.ts`** — currently uses `createNotFoundError`, `createValidationError`, `createAppError`. Convert all per rules. Remove `@/shared/types/errors` import. Add `import { HTTPException } from 'hono/http-exception';`.

- [ ] **`src/engines/financial/fund-management.ts`** — read first to see which error utilities it uses. Convert per rules.

- [ ] **`src/engines/stripe/stripe-api-adapter.ts`** — currently uses `createAppError` with status 400 and 500. Convert:
  - `createAppError('STRIPE_ACCOUNT_MISSING', 'msg', 400, ...)` → `throw new HTTPException(400, { message: 'msg' })`
  - All `createAppError('...', 'msg', 500, ...)` → `throw new Error('msg')`
  - Replace each Stripe catch block to use `wrapStripeError(error)` from `@/shared/utils/stripe-error`

- [ ] **Run typecheck**

```bash
pnpm run typecheck
```

Fix any errors before committing.

- [ ] **Commit**

```bash
git add src/engines/financial/refund-engine.ts \
        src/engines/financial/refund-reconciliation.ts \
        src/engines/financial/fund-management.ts \
        src/engines/stripe/stripe-api-adapter.ts
git commit -m "refactor(engines): replace createAppError with HTTPException/Error across engine files"
```

---

## Task 3: Convert invoice module service files

**Files:**
- Modify: `src/modules/invoices/services/invoice-stripe-coordination.service.ts`
- Modify: `src/modules/invoices/services/refund-requests.service.ts`
- Modify: `src/modules/invoices/services/invoice-lifecycle.service.ts`
- Modify: `src/modules/invoices/services/invoice-client-resolver.service.ts`
- Modify: `src/modules/invoices/services/invoice-queries.service.ts`
- Modify: `src/modules/invoices/services/invoice-creation.service.ts`

Read each file before editing. Apply the conversion rules from the table at the top of this plan.

**Special cases to watch for:**

- `invoice-stripe-coordination.service.ts` has `'kind' in error` re-throw guards — **remove them entirely**
- `refund-requests.service.ts` has 21 uses — go through each one carefully
- Any `createTransactionError(...)` → `throw new Error('msg')`

For each file:
- [ ] Read the file
- [ ] Replace all `createAppError`/`createNotFoundError`/`createValidationError`/`createTransactionError` calls per conversion rules
- [ ] Remove `'kind' in error` re-throw guard blocks
- [ ] Remove `import { ... } from '@/shared/types/errors'`
- [ ] Add `import { HTTPException } from 'hono/http-exception'` if not already present

- [ ] **Run typecheck after all 6 files are done**

```bash
pnpm run typecheck
```

Fix any errors before committing.

- [ ] **Commit**

```bash
git add src/modules/invoices/services/invoice-stripe-coordination.service.ts \
        src/modules/invoices/services/refund-requests.service.ts \
        src/modules/invoices/services/invoice-lifecycle.service.ts \
        src/modules/invoices/services/invoice-client-resolver.service.ts \
        src/modules/invoices/services/invoice-queries.service.ts \
        src/modules/invoices/services/invoice-creation.service.ts
git commit -m "refactor(modules/invoices): replace createAppError with HTTPException/Error across invoice services

Removes 'kind' in error re-throw guards. Consistent throw-based error
handling now matches CLAUDE.md standard throughout invoice module."
```

---

## Task 4: Delete `src/shared/types/errors.ts` and verify

- [ ] **Check no remaining imports** of the errors utility:

```bash
grep -r "from '@/shared/types/errors'" src/ --include='*.ts'
```

Expected: no output. If any files still import from it, convert them before proceeding.

- [ ] **Delete the file**:

```bash
rm src/shared/types/errors.ts
```

- [ ] **Run typecheck**:

```bash
pnpm run typecheck
```

Expected: clean pass.

- [ ] **Run format check**:

```bash
pnpm run format:check
```

- [ ] **Commit**:

```bash
git add -A
git commit -m "chore: delete shared/types/errors.ts — replaced by HTTPException throughout"
```

---

## Summary

After this plan:
- Every service and engine throws `HTTPException` (4xx) or `new Error` (500) — no plain object throws
- Stack traces preserved on all errors
- `'kind' in error` guards eliminated
- Stripe errors normalised by type (card=422, transient=retry, auth=500)
- DB errors normalised by pg code (unique=409, fk=400, serialization=retry)
- `src/shared/types/errors.ts` deleted
- Fully aligned with CLAUDE.md error handling mandate
