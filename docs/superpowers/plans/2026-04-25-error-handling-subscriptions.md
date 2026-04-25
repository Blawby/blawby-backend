# Error Handling Migration — `subscriptions` Module

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `subscription.service.ts` from `Result<T>` to throw-based error handling. The handler-facing service functions (`listPlans`, `getCurrentSubscription`, `cancelSubscription`) return data directly and throw on failure. Worker/webhook services (`meteredProducts.service.ts`, `syncPlans.service.ts`, `subscriptionWebhooks.service.ts`) use raw `Error` (not `HTTPException`) — this is intentional so Graphile Worker retries on failure.

**Architecture:** `assertSubscriptionReadAccess` and `assertSubscriptionManageAccess` already throw (void return) — they stay unchanged. Only the `Result<T>` return types and `ok()`/`internalError()`/`notFound()`/`badRequest()` calls need replacing. `meteredProducts.service.ts` and `syncPlans.service.ts` are out of scope for `HTTPException` — they should use `throw new Error(...)` for failures.

**Tech Stack:** Hono + `@hono/zod-openapi`, TypeScript 5.9, `hono/http-exception`

---

## File Map

| File | Change |
|------|--------|
| `src/modules/subscriptions/services/subscription.service.ts` | Remove `Result<T>` returns; return data directly; throw `HTTPException` for expected failures |
| `src/modules/subscriptions/services/meteredProducts.service.ts` | Change `Result<void>` / `Result<T>` returns to `void`/data + raw `Error` throws |
| `src/modules/subscriptions/services/syncPlans.service.ts` | Change `Result<SyncResult>` return to data directly + raw `Error` throws |
| `src/modules/subscriptions/services/subscriptionWebhooks.service.ts` | Out of scope for this plan; already uses worker/webhook-style raw errors rather than handler-facing `Result<T>` returns |
| `src/modules/subscriptions/handlers.ts` | Remove `sendResult`; return `c.json(data, status)` directly |

---

## Task 1: Migrate `subscription.service.ts`

**Files:**
- Modify: `src/modules/subscriptions/services/subscription.service.ts`

- [ ] **Step 1: Replace Result imports**

Remove all imports from `@/shared/utils/result` (`ok`, `internalError`, `notFound`, `badRequest`) and `import type { Result } from '@/shared/types/result'`.

Add:
```typescript
import { HTTPException } from 'hono/http-exception';
```

- [ ] **Step 2: Replace `listPlans`**

Change signature and remove `Result<T>` wrapping:

```typescript
const listPlans = async (): Promise<{ plans: SubscriptionPlanResponse[] }> => {
  const plans = await subscriptionRepository.findAllActivePlans(db);

  const planIds = plans.map((plan) => plan.id);
  const prices: SubscriptionPrice[] =
    planIds.length > 0 ? await subscriptionRepository.findPricesByPlanIds(db, planIds) : [];

  const pricesByPlan = prices.reduce<Record<string, SubscriptionPrice[]>>((planPriceMap, price) => {
    const planId = price.plan_id;
    if (!planId) return planPriceMap;
    planPriceMap[planId] ??= [];
    planPriceMap[planId].push(price);
    return planPriceMap;
  }, {});

  const response: SubscriptionPlanResponse[] = plans.map((plan) => {
    const planPrices = pricesByPlan[plan.id] ?? [];
    const currency = planPrices[0]?.currency ?? '';
    const monthlyPrice = planPrices.find((price) => price.interval === 'month');
    const yearlyPrice = planPrices.find((price) => price.interval === 'year');
    const meteredPrices = planPrices.filter((price) => price.usage_type === 'metered');

    return {
      id: plan.id,
      name: plan.name,
      display_name: plan.display_name,
      description: plan.description,
      stripe_product_id: plan.stripe_product_id,
      stripe_monthly_price_id: monthlyPrice?.stripe_price_id ?? null,
      stripe_yearly_price_id: yearlyPrice?.stripe_price_id ?? null,
      monthly_price: monthlyPrice ? monthlyPrice.unit_amount : null,
      yearly_price: yearlyPrice ? yearlyPrice.unit_amount : null,
      currency,
      features: plan.features,
      limits: plan.limits,
      metered_items: meteredPrices.length
        ? meteredPrices.map((meteredPrice) => ({
            price_id: meteredPrice.stripe_price_id,
            meter_name: meteredPrice.meter_name,
            type: meteredPrice.internal_type,
          }))
        : null,
      is_active: plan.is_active,
      is_public: plan.is_public,
      sort_order: plan.sort_order,
      metadata: plan.metadata,
      image: plan.image,
      created_at: plan.created_at,
      updated_at: plan.updated_at,
    };
  });

  return { plans: response };
};
```

- [ ] **Step 3: Replace `getCurrentSubscription`**

Change return type to `Promise<GetCurrentSubscriptionResponse>` and replace `return ok(...)` / `return notFound(...)` / `return badRequest(...)` / `return internalError(...)` with direct returns and throws:

- `return ok({ subscription: ... })` → `return { subscription: ... }`
- `return notFound('Organization not found')` → `throw new HTTPException(404, { message: 'Organization not found' })`
- `return badRequest('No active organization...')` → `throw new HTTPException(400, { message: 'No active organization. Please select an organization first.' })`
- `return internalError(...)` → `throw new HTTPException(500, { message: ... })` (or just let the catch block re-throw as raw Error)

Replace the outer `try/catch` that returns `internalError` with one that logs and re-throws:
```typescript
} catch (error) {
  logger.error('Failed to get current subscription for org {organizationId}: {error}', {
    organizationId,
    error,
  });
  throw error;
}
```

- [ ] **Step 4: Replace `cancelSubscription`**

Change return type to `Promise<{ url: string; redirect: boolean }>` and apply the same pattern:

- `return ok({ url, redirect })` → `return { url: result.url, redirect: result.redirect }`
- `return badRequest(...)` → `throw new HTTPException(400, { message: ... })`
- `return notFound(...)` → `throw new HTTPException(404, { message: ... })`
- Replace `internalError` catch with a re-throw.

---

## Task 2: Migrate `meteredProducts.service.ts`

Worker-facing service — uses raw `Error`, not `HTTPException`.

**Files:**
- Modify: `src/modules/subscriptions/services/meteredProducts.service.ts`

- [ ] **Step 1: Replace Result imports**

Remove `import type { Result } from '@/shared/types/result'` and result utility imports.

- [ ] **Step 2: Replace `Result<void>` / `Result<T>` function signatures**

For each function:
- Change return type from `Promise<Result<void>>` to `Promise<void>`
- Change return type from `Promise<Result<T>>` to `Promise<T>`
- Replace `return ok(...)` → `return data` or just `return`
- Replace `return internalError(msg)` / error returns → `throw new Error(msg)`
- Replace `return fail(msg)` → `throw new Error(msg)`

---

## Task 3: Migrate `syncPlans.service.ts`

Worker-facing service — uses raw `Error`.

**Files:**
- Modify: `src/modules/subscriptions/services/syncPlans.service.ts`

- [ ] **Step 1: Replace Result imports and `syncAllPlansFromStripe` signature**

Change `Promise<Result<SyncResult>>` to `Promise<SyncResult>` where `SyncResult` is `{ synced: number; errorCount: number; errors: ... }`.

Replace `return ok({ synced: result.synced, errorCount: result.errors.length, errors: result.errors })` with a direct return. Individual plan sync errors are already logged and accumulated — the function does not throw for per-plan failures, only for top-level failures.

---

## Task 4: Update `handlers.ts`

**Files:**
- Modify: `src/modules/subscriptions/handlers.ts`

- [ ] **Step 1: Replace entire file**

```typescript
import type { routes } from '@/modules/subscriptions/routes';
import { subscriptionService } from '@/modules/subscriptions/services/subscription.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

const listPlansHandler: AppRouteHandler<typeof routes.listPlansRoute> = async (c) => {
  const data = await subscriptionService.listPlans();
  return c.json(data, 200);
};

const getCurrentSubscriptionHandler: AppRouteHandler<typeof routes.getCurrentSubscriptionRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const data = await subscriptionService.getCurrentSubscription({}, ctx);
  return c.json(data, 200);
};

const cancelSubscriptionHandler: AppRouteHandler<typeof routes.cancelSubscriptionRoute> = async (c) => {
  const validatedBody = c.req.valid('json');
  const ctx = getServiceContext(c);
  const data = await subscriptionService.cancelSubscription({ data: validatedBody }, ctx);
  return c.json(data, 200);
};

export const handlers = {
  listPlansHandler,
  getCurrentSubscriptionHandler,
  cancelSubscriptionHandler,
};
```

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
