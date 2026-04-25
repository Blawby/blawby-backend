# Error Handling Migration — `onboarding` Module

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `onboarding.service.ts` and `connected-accounts.service.ts` from `Result<T>` to throw-based error handling. The stripe `handlers.ts` which calls `connectedAccountsService.getAccount()` is also cleaned up as part of this plan since it currently manually converts `Result<T>`.

**Architecture:** `assertOnboardingAccess` already throws (void) — unchanged. `onboardingService` methods return data directly and throw on failure. `connectedAccountsService` methods return data directly and throw on failure. The stripe `getConnectedAccountHandler` becomes a clean direct call after the service migration.

**Tech Stack:** Hono + `@hono/zod-openapi`, TypeScript 5.9, `hono/http-exception`

---

## File Map

| File | Change |
|------|--------|
| `src/modules/onboarding/services/connected-accounts.service.ts` | All methods return data directly; throw `HTTPException` on failure |
| `src/modules/onboarding/services/onboarding.service.ts` | All methods return data directly; throw `HTTPException` on failure |
| `src/modules/onboarding/handlers.ts` | Remove `sendResult`; return `c.json(data, status)` directly |
| `src/modules/stripe/handlers.ts` | Clean up manual `Result<T>` conversion in `getConnectedAccountHandler` |

---

## Task 1: Migrate `connected-accounts.service.ts`

This is a dependency of `onboarding.service.ts` and `intake-creation/checkout` services.

**Files:**
- Modify: `src/modules/onboarding/services/connected-accounts.service.ts`

- [ ] **Step 1: Read the current file**

```bash
cat src/modules/onboarding/services/connected-accounts.service.ts
```

- [ ] **Step 2: Replace Result imports**

Remove `import type { Result } from '@/shared/types/result'` and result utility imports.

Add `import { HTTPException } from 'hono/http-exception'`.

- [ ] **Step 3: Replace all method signatures and bodies**

For each method returning `Promise<Result<T>>`:
- Change to `Promise<T>`
- Replace `return ok(data)` → `return data`
- Replace `return fail(msg, status)` / `return internalError(msg)` → `throw new HTTPException(status, { message: msg })`
- Replace `return notFound(msg)` → `throw new HTTPException(404, { message: msg })`

Key method: `getAccount` currently returns `Promise<Result<GetAccountResponse | null>>`. After migration: `Promise<GetAccountResponse | null>` — returns `null` when no account found (not an error), throws only on actual failures.

Key method: `createOrGetAccount` is called by `onboardingService` which currently checks `if (!result.success) return result`. After migration: caller just `await`s it with no result check.

- [ ] **Step 4: Update named exports at bottom of file**

The file exports individual methods as named exports. These re-exports don't need changing — they just point to the same functions whose signatures changed.

---

## Task 2: Migrate `onboarding.service.ts`

**Files:**
- Modify: `src/modules/onboarding/services/onboarding.service.ts`

- [ ] **Step 1: Replace Result imports**

Remove `import type { Result } from '@/shared/types/result'` and `import { ok, notFound, internalError } from '@/shared/utils/result'`.

Add `import { HTTPException } from 'hono/http-exception'`.

- [ ] **Step 2: Replace `getOnboardingStatus`**

Change return type from `Promise<Result<OnboardingStatusResponse>>` to `Promise<OnboardingStatusResponse>`:

```typescript
async getOnboardingStatus(
  { organizationId }: { organizationId: string },
  ctx: ServiceContext
): Promise<OnboardingStatusResponse> {
  assertOnboardingAccess(ctx);

  const organization = await organizationRepository.findById(organizationId);
  if (!organization) {
    throw new HTTPException(404, { message: `Organization not found for ${organizationId}` });
  }

  const account = await onboardingRepo.findByOrganizationId(organizationId);

  if (!account) {
    return {
      practice_uuid: organizationId,
      connected_account_id: null,
      stripe_account_id: null,
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
    };
  }

  return {
    practice_uuid: organizationId,
    connected_account_id: account.id,
    stripe_account_id: account.stripe_account_id,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted,
  };
},
```

- [ ] **Step 3: Replace `createConnectedAccount`**

Change return type from `Promise<Result<OnboardingStatusResponse>>` to `Promise<OnboardingStatusResponse>`:

```typescript
async createConnectedAccount(
  params: { email: string; organizationId: string; refreshUrl: string; returnUrl: string },
  ctx: ServiceContext
): Promise<OnboardingStatusResponse> {
  const { email, organizationId, refreshUrl, returnUrl } = params;
  const { user } = ctx;

  assertOnboardingAccess(ctx);

  const organization = await organizationRepository.findById(organizationId);
  if (!organization) {
    throw new HTTPException(404, { message: `Organization not found for ${organizationId}` });
  }

  // createOrGetAccount now throws on failure (after Task 1 migration)
  const accountData = await connectedAccountsService.createOrGetAccount(
    organizationId,
    email,
    refreshUrl,
    returnUrl,
    user.id
  );

  const connectedAccount = await onboardingRepo.findByStripeAccountId(accountData.account_id);
  if (!connectedAccount) {
    throw new HTTPException(500, { message: 'Connected account was created but could not be loaded' });
  }

  return {
    practice_uuid: organizationId,
    connected_account_id: connectedAccount.id,
    url: accountData.url,
    stripe_account_id: accountData.account_id,
    charges_enabled: accountData.status.charges_enabled,
    payouts_enabled: accountData.status.payouts_enabled,
    details_submitted: accountData.status.details_submitted,
  };
},
```

- [ ] **Step 4: Replace `createOnboardingSession` (if present)**

Same pattern as `createConnectedAccount`.

---

## Task 3: Update `onboarding/handlers.ts`

**Files:**
- Modify: `src/modules/onboarding/handlers.ts`

- [ ] **Step 1: Replace entire file**

```typescript
import type { createConnectedAccountRoute, getOnboardingStatusRoute } from '@/modules/onboarding/routes';
import { onboardingService } from '@/modules/onboarding/services/onboarding.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

const getOnboardingStatusHandler: AppRouteHandler<typeof getOnboardingStatusRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id: organizationId } = c.req.valid('param');
  const data = await onboardingService.getOnboardingStatus({ organizationId }, ctx);
  return c.json(data, 200);
};

const createConnectedAccountHandler: AppRouteHandler<typeof createConnectedAccountRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const validatedBody = c.req.valid('json');
  const data = await onboardingService.createConnectedAccount(
    {
      email: validatedBody.practice_email,
      organizationId: validatedBody.practice_uuid,
      refreshUrl: validatedBody.refresh_url,
      returnUrl: validatedBody.return_url,
    },
    ctx
  );
  return c.json(data, 201);
};

export const handlers = {
  createConnectedAccountHandler,
  getOnboardingStatusHandler,
};
```

---

## Task 4: Clean up `stripe/handlers.ts`

**Files:**
- Modify: `src/modules/stripe/handlers.ts`

- [ ] **Step 1: Replace `getConnectedAccountHandler`**

After `connected-accounts.service.ts` migration, `getAccount` returns `GetAccountResponse | null` directly (no `Result<T>`). Replace:

```typescript
const getConnectedAccountHandler: AppRouteHandler<typeof getConnectedAccountRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const account = await connectedAccountsService.getAccount(ctx.organizationId);
  if (account === null) {
    throw new HTTPException(404, { message: 'No connected Stripe account found for this practice' });
  }
  return c.json(account);
};
```

Keep `import { HTTPException } from 'hono/http-exception'` because `HTTPException` is still required for the 404 throw in `getConnectedAccountHandler`.

---

## Task 5: Typecheck Gate

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
