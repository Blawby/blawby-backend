# Error Handling Migration — `practice-client-intakes` Module

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all 4 intake service files and their handlers from `Result<T>` / `sendResult` to throw-based error handling. Helpers (`intake-access.helpers.ts`, `intake-shared.helpers.ts`) are migrated first since they are dependencies of the services.

**Architecture:** `intake-access.helpers.ts` exports `getStaffAccessibleIntake`, `getActorAccessibleIntake`, `ensureStaffOrganizationAccess` — these currently return `Result<T>`. After migration they throw `HTTPException` directly. All `intake-*.service.ts` functions return data directly and throw on failure. The `intake-stripe.helpers.ts` does not use `Result<T>` and is out of scope.

**Tech Stack:** Hono + `@hono/zod-openapi`, TypeScript 5.9, `hono/http-exception`, `@casl/ability`

---

## File Map

| File | Change |
|------|--------|
| `src/modules/practice-client-intakes/services/intake-access.helpers.ts` | `ensureStaffOrganizationAccess`, `getStaffAccessibleIntake`, `getActorAccessibleIntake` → throw instead of return `Result<T>` |
| `src/modules/practice-client-intakes/services/intake-shared.helpers.ts` | Remove `Result<T>` returns where applicable |
| `src/modules/practice-client-intakes/services/intake-creation.service.ts` | All functions return data directly; throw on failure |
| `src/modules/practice-client-intakes/services/intake-checkout.service.ts` | All functions return data directly; throw on failure |
| `src/modules/practice-client-intakes/services/intake-lifecycle.service.ts` | All functions return data directly; throw on failure |
| `src/modules/practice-client-intakes/handlers.ts` | Remove `sendResult`; return `c.json(data, status)` directly |

---

## Task 1: Migrate `intake-access.helpers.ts`

This is the shared dependency — migrate first.

**Files:**
- Modify: `src/modules/practice-client-intakes/services/intake-access.helpers.ts`

- [ ] **Step 1: Read the current file**

```bash
cat src/modules/practice-client-intakes/services/intake-access.helpers.ts
```

- [ ] **Step 2: Replace `ensureStaffOrganizationAccess`**

Change from returning `Result<void>` to throwing:

```typescript
export const ensureStaffOrganizationAccess = (organizationId: string, ctx: ServiceContext): void => {
  if (ctx.organizationId !== organizationId) {
    throw new HTTPException(403, { message: 'Access denied: organization mismatch' });
  }
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'PracticeClientIntake');
};
```

Add imports: `import { HTTPException } from 'hono/http-exception'` and `import { ForbiddenError } from '@casl/ability'` (if not already present).

- [ ] **Step 3: Replace `getStaffAccessibleIntake` and `getActorAccessibleIntake`**

Change both from `Promise<Result<Intake>>` to `Promise<Intake>` — throw `HTTPException(404, ...)` when not found, throw `HTTPException(403, ...)` on access denial.

Remove `Result<T>` imports from this file.

---

## Task 2: Migrate `intake-shared.helpers.ts`

**Files:**
- Modify: `src/modules/practice-client-intakes/services/intake-shared.helpers.ts`

- [ ] **Step 1: Read the current file**

```bash
cat src/modules/practice-client-intakes/services/intake-shared.helpers.ts
```

- [ ] **Step 2: Replace any `Result<T>` return functions**

For each function returning `Result<T>`:
- Change to return data directly
- Replace `return ok(data)` → `return data`
- Replace error returns → `throw new HTTPException(status, { message })`

Remove `Result<T>` type imports and result utility imports.

---

## Task 3: Migrate `intake-creation.service.ts`

**Files:**
- Modify: `src/modules/practice-client-intakes/services/intake-creation.service.ts`

- [ ] **Step 1: Replace Result imports**

Remove `import type { Result } from '@/shared/types/result'` and `import { result } from '@/shared/utils/result'`.

Add `import { HTTPException } from 'hono/http-exception'`.

- [ ] **Step 2: Replace `getIntakeSettings`**

Change return type from `Promise<Result<IntakeSettingsResponse>>` to `Promise<IntakeSettingsResponse>`:

- `return result.notFound(...)` → `throw new HTTPException(404, { message: ... })`
- `return result.forbidden(...)` → `throw new HTTPException(403, { message: ... })`
- `return result.ok({ success: true, data: ... })` → `return { success: true, data: ... }`

Remove the outer `try/catch` that returns `internalError` — let errors propagate naturally.

- [ ] **Step 3: Replace `createIntake`**

Change return type from `Promise<Result<CreateIntakeResponse>>` to `Promise<CreateIntakeResponse>`:

- Replace all `result.badRequest(...)` → `throw new HTTPException(400, { message: ... })`
- Replace all `result.notFound(...)` → `throw new HTTPException(404, { message: ... })`
- Replace all `result.forbidden(...)` → `throw new HTTPException(403, { message: ... })`
- Replace all `result.ok(data)` → `return data`
- Replace `result.internalError(...)` catch blocks → `throw error` (re-throw) after logging

- [ ] **Step 4: Replace `updateIntake`**

Same pattern as `createIntake`.

---

## Task 4: Migrate `intake-checkout.service.ts`

**Files:**
- Modify: `src/modules/practice-client-intakes/services/intake-checkout.service.ts`

- [ ] **Step 1: Replace Result imports**

Same as Task 3 Step 1.

- [ ] **Step 2: Replace `createCheckoutSession`**

Change return type from `Promise<Result<CreateCheckoutSessionResponse>>` to `Promise<CreateCheckoutSessionResponse>`:

- After migrating `getActorAccessibleIntake` (Task 1), the `intakeResult.success` check becomes unnecessary — `await getActorAccessibleIntake(...)` throws on failure.
- `return result.badRequest(...)` → `throw new HTTPException(400, { message: ... })`
- `return result.notFound(...)` → `throw new HTTPException(404, { message: ... })`
- `return result.forbidden(...)` → `throw new HTTPException(403, { message: ... })`
- `return result.fail(...)` → `throw new HTTPException(500, { message: ... })`
- `return result.ok({ success: true, data: ... })` → `return { success: true, data: ... }`

- [ ] **Step 3: Replace `getIntakeStatus` and `getPostPayStatus`**

Same pattern. Return data directly, throw on failure.

---

## Task 5: Migrate `intake-lifecycle.service.ts`

**Files:**
- Modify: `src/modules/practice-client-intakes/services/intake-lifecycle.service.ts`

- [ ] **Step 1: Replace Result imports**

Same as Task 3 Step 1.

- [ ] **Step 2: Replace `listIntakes`**

Change return type from `Promise<PaginatedResultWithMeta<ListIntakeItem, 'intakes'>>` to `Promise<{ intakes: ListIntakeItem[]; total: number; page: number; limit: number; total_pages: number }>`:

- `ensureStaffOrganizationAccess` call becomes a statement (no result check needed after Task 1)
- `return result.badRequest(...)` → `throw new HTTPException(400, { message: ... })`
- `return result.ok({ intakes, total, page, limit, total_pages })` → `return { intakes: ..., total, page, limit, total_pages }`
- Replace `internalError` catch → re-throw after logging

- [ ] **Step 3: Replace `getIntakeById`**

Change return type to return the data shape directly:
- `getStaffAccessibleIntake` becomes `await getStaffAccessibleIntake(...)` with no result check
- `return result.ok({ success: true, data: ... })` → `return { success: true, data: ... }`

- [ ] **Step 4: Replace `updateTriageStatus`, `triggerInvitation`, `convertIntake`**

Same pattern for each:
- Remove `intakeResult.success` checks (helper now throws)
- Replace `result.ok(...)` → direct return
- Replace `result.badRequest/notFound/forbidden(...)` → `throw new HTTPException(status, { message })`

---

## Task 6: Update `handlers.ts`

**Files:**
- Modify: `src/modules/practice-client-intakes/handlers.ts`

- [ ] **Step 1: Remove `sendResult` import**

```typescript
// Remove this line:
import { sendResult } from '@/shared/utils/responseUtils';
```

- [ ] **Step 2: Replace all `sendResult` calls**

For each handler, replace `return sendResult(c, result, status)` with `return c.json(data, status)` where `data` is the awaited service return value.

Pattern for every handler:

```typescript
// Before:
const result = await someService.someMethod(params, ctx);
return sendResult(c, result, 200);

// After:
const data = await someService.someMethod(params, ctx);
return c.json(data, 200);
```

Apply this to all 11 handlers: `getIntakeSettingsHandler`, `createPracticeClientIntakeHandler`, `createPracticeClientIntakeCheckoutSessionHandler`, `updatePracticeClientIntakeHandler`, `getPracticeClientIntakeStatusHandler`, `getPracticeClientIntakePostPayStatusHandler`, `triggerIntakeInvitationHandler`, `listIntakesHandler`, `getIntakeHandler`, `updateIntakeTriageStatusHandler`, `convertIntakeHandler`.

---

## Task 7: Typecheck Gate

- [ ] **Step 1: Run typecheck**

```bash
pnpm run typecheck
```

Expected: zero errors. Fix any before proceeding.

- [ ] **Step 2: Run format check**

```bash
pnpm run format:check
```

If errors, run `pnpm run format`.
