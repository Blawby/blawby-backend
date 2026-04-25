# Error Handling Migration — `stripe` Module + `engagement-contracts` validation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two small items bundled into one plan since both are fast. (1) Stripe module: `stripe/handlers.ts` already mostly migrated — `createAccountSessionHandler` is clean. `getConnectedAccountHandler` is cleaned up in the onboarding plan (Task 4). Verify no remaining `Result<T>` usage in stripe services. (2) Engagement contracts: add `practice_id` URL param validation against `ctx.organizationId` in `engagement-contract.service.ts` (audit item 2, last remaining task).

**Prerequisite:** The onboarding plan (`2026-04-25-error-handling-onboarding.md`) must be complete before this plan, since `connected-accounts.service.ts` migration affects stripe's handler.

**Tech Stack:** Hono + `@hono/zod-openapi`, TypeScript 5.9, `hono/http-exception`

---

## File Map

| File | Change |
|------|--------|
| `src/modules/stripe/services/` | Verify no `Result<T>` usage; fix any found |
| `src/modules/engagement-contracts/services/engagement-contract.service.ts` | Add `practice_id` validation against `ctx.organizationId` at top of each service function |

---

## Task 1: Audit stripe services for `Result<T>`

**Files:**
- Read: `src/modules/stripe/services/`

- [ ] **Step 1: Scan for Result usage**

```bash
grep -rnE "import .*\\b(Result|sendResult)\\b from" src/modules/stripe/services/ --include="*.ts"
grep -rnE "\\bResult<|\\bsendResult\\s*\\(" src/modules/stripe/services/ --include="*.ts"
```

- [ ] **Step 2: Fix any findings**

If any stripe service functions return `Result<T>`:
- Change return type to direct data type
- Replace `return ok(data)` → `return data`
- Replace `return internalError/notFound/badRequest(msg)` → `throw new HTTPException(status, { message: msg })`

If nothing is found, this task is complete as-is.

---

## Task 2: Add `practice_id` validation in `engagement-contract.service.ts`

This is audit item 2's last remaining task. The engagement-contracts routes include `practice_id` in the URL path, but the service does not validate it matches `ctx.organizationId`.

**Files:**
- Modify: `src/modules/engagement-contracts/services/engagement-contract.service.ts`

- [ ] **Step 1: Read the current service**

```bash
cat src/modules/engagement-contracts/services/engagement-contract.service.ts
```

- [ ] **Step 2: Add validation helper**

Add a small inline validation at the top of each service function that receives `practice_id` (either directly or via params):

```typescript
if (practiceId !== ctx.organizationId) {
  throw new HTTPException(403, { message: 'Access denied: practice_id does not match your organization' });
}
```

Apply this check in every function that takes `practice_id` as a parameter. The check must come before any DB queries.

- [ ] **Step 3: Verify handlers pass practice_id correctly**

```bash
cat src/modules/engagement-contracts/handlers.ts
```

Confirm handlers extract `practice_id` from `c.req.valid('param')` and pass it to the service. If not, update the handler to pass it.

---

## Task 3: Typecheck Gate

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

- [ ] **Step 3: Update inconsistencies-audit.md**

Mark item 2 (`engagement-contracts` practice_id validation) as ✅ in `docs/superpowers/inconsistencies-audit.md`.
