# Error Handling Migration — `trust` Module

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `trust.service.ts` from `Result<T>` to throw-based error handling. Convert `assertTrustManageAccess`/`assertTrustReadAccess` from `Result<void>` returns to direct throws. Convert `withTrustLock` to throw instead of returning `Result<T>`. All public service functions return data directly.

**Architecture:** `withTrustLock` is the key structural change — its `execute` callback type changes from `Promise<Result<T>>` to `Promise<T>`, and the helper throws `HTTPException(409)` on lock timeout instead of returning `result.conflict(...)`. Retry logic for serialization failures (40001) is preserved unchanged. `recordDeposit`/`recordWithdrawal` are called by invoice/webhook code paths — they throw `HTTPException` for expected failures (bad amount, insufficient funds) so callers get proper HTTP errors.

**Tech Stack:** Hono + `@hono/zod-openapi`, TypeScript 5.9, `hono/http-exception`, `@casl/ability`

---

## File Map

| File | Change |
|------|--------|
| `src/modules/trust/services/trust.service.ts` | Remove `assertTrust*Access` helpers; use `ForbiddenError.from().throwUnlessCan()` directly; convert `withTrustLock` to throw-based; all functions return data directly |
| `src/modules/trust/handlers.ts` | Remove `sendResult`; return `c.json(data, status)` directly |

---

## Task 1: Migrate `trust.service.ts`

**Files:**
- Modify: `src/modules/trust/services/trust.service.ts`

- [ ] **Step 1: Replace imports**

Remove:
```typescript
import { result } from '@/shared/utils/result';
import type { Result } from '@/shared/types/result';
```

Add (if not already present):
```typescript
import { HTTPException } from 'hono/http-exception';
```

(`ForbiddenError` is already imported.)

- [ ] **Step 2: Remove `assertTrustManageAccess` and `assertTrustReadAccess`**

Delete both helper functions entirely. Their logic moves inline at each call site as:
```typescript
ForbiddenError.from(ctx.ability).throwUnlessCan('manage', 'Trust');
// or
ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Trust');
```

- [ ] **Step 3: Rewrite `withTrustLock`**

```typescript
const withTrustLock = async <T>(
  params: { organizationId: string; clientId: string; matterId?: string | null },
  execute: (trx: typeof db) => Promise<T>,
  tx?: typeof db
): Promise<T> => {
  const lockKey = `${params.organizationId}:${params.clientId}:${params.matterId ?? 'no-matter'}`;

  const runWithLock = async (trx: typeof db): Promise<T> => {
    await trx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await trx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    return execute(trx);
  };

  const run = async (attempt: number): Promise<T> => {
    try {
      return tx ? await runWithLock(tx) : await db.transaction(runWithLock);
    } catch (error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : null;

      if (code === '55P03') {
        logger.warn('Trust lock timed out waiting for advisory lock', { lockKey });
        throw new HTTPException(409, { message: 'Operation timed out due to high concurrency. Please try again.' });
      }

      const canRetry = code === '40001' && !tx && attempt <= 3;
      if (!canRetry) {
        throw error;
      }

      const delay = 100 * 2 ** attempt;
      logger.info('Retrying trust transaction after serialization failure (attempt {attempt}/3)', { attempt });
      await new Promise((r) => setTimeout(r, delay));
      return run(attempt + 1);
    }
  };

  return run(1);
};
```

- [ ] **Step 4: Rewrite `recordDeposit`**

```typescript
const recordDeposit = async (
  params: RecordDepositParams,
  tx?: Parameters<typeof trustTransactionsRepository.createTransaction>[1]
): Promise<SelectTrustTransaction> => {
  if (params.amount <= 0) {
    throw new HTTPException(400, { message: 'Amount must be positive' });
  }

  return withTrustLock(
    params,
    async (trx) => {
      const balanceRow = await trustTransactionsRepository.getLatestBalanceForMatter(
        params.organizationId,
        params.clientId,
        params.matterId ?? null,
        trx
      );
      const currentBalance = balanceRow?.balance ?? 0;
      const newBalance = currentBalance + params.amount;

      return trustTransactionsRepository.createTransaction(
        {
          organization_id: params.organizationId,
          client_id: params.clientId,
          matter_id: params.matterId ?? null,
          transaction_type: 'deposit',
          amount: params.amount,
          balance_after: newBalance,
          description: params.description ?? 'Retainer deposit',
          source: params.source ?? 'retainer_invoice',
          invoice_id: params.invoiceId ?? null,
          stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
          created_by: params.createdBy,
        },
        trx
      );
    },
    tx
  );
};
```

- [ ] **Step 5: Rewrite `recordWithdrawal`**

```typescript
const recordWithdrawal = async (
  params: RecordWithdrawalParams,
  tx?: Parameters<typeof trustTransactionsRepository.createTransaction>[1]
): Promise<SelectTrustTransaction> => {
  if (params.amount <= 0) {
    throw new HTTPException(400, { message: 'Amount must be positive' });
  }

  return withTrustLock(
    params,
    async (trx) => {
      const balanceRow = await trustTransactionsRepository.getLatestBalanceForMatter(
        params.organizationId,
        params.clientId,
        params.matterId ?? null,
        trx
      );
      const currentBalance = balanceRow?.balance ?? 0;

      if (currentBalance < params.amount) {
        throw new HTTPException(400, { message: 'Insufficient funds' });
      }

      const newBalance = currentBalance - params.amount;

      return trustTransactionsRepository.createTransaction(
        {
          organization_id: params.organizationId,
          client_id: params.clientId,
          matter_id: params.matterId ?? null,
          transaction_type: 'withdrawal',
          amount: params.amount,
          balance_after: newBalance,
          description: params.description ?? 'Invoice payment from retainer',
          source: params.source ?? 'invoice_payment',
          invoice_id: params.invoiceId ?? null,
          stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
          created_by: params.createdBy,
        },
        trx
      );
    },
    tx
  );
};
```

- [ ] **Step 6: Rewrite `getTransactions`**

```typescript
const getTransactions = async (
  params: GetTransactionsParams,
  ctx: ServiceContext
): Promise<SelectTrustTransaction[]> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Trust');
  return trustTransactionsRepository.listByOrg(params);
};
```

- [ ] **Step 7: Rewrite `getBalanceWithTx` and `getBalance`**

```typescript
const getBalanceWithTx = async (
  params: GetBalanceParams,
  tx?: typeof db
): Promise<{ total: number; byMatter: { matter_id: string | null; balance: number }[] }> => {
  const rows = await trustTransactionsRepository.getLatestBalanceByClient(params.organizationId, params.clientId, tx);
  const total = rows.reduce((sum, r) => sum + r.balance, 0);
  return { total, byMatter: rows };
};

const getBalance = async (
  params: GetBalanceParams,
  ctx: ServiceContext
): Promise<{ total: number; byMatter: { matter_id: string | null; balance: number }[] }> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Trust');
  return getBalanceWithTx(params);
};
```

- [ ] **Step 8: Rewrite `getReport`**

```typescript
const getReport = async (params: GetReportParams, ctx: ServiceContext): Promise<SelectTrustTransaction[]> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Trust');
  return trustTransactionsRepository.listByOrg(params);
};
```

- [ ] **Step 9: Rewrite `syncBalanceAndCheckThreshold`**

```typescript
const syncBalanceAndCheckThreshold = async (
  matterId: string,
  organizationId: string,
  clientId: string,
  ctx: ServiceContext,
  tx: typeof db
) => {
  try {
    const balance = await getBalanceWithTx({ organizationId, clientId }, tx);
    const matterBalance = balance.byMatter.find((m) => m.matter_id === matterId)?.balance ?? 0;
    await mattersQueries.updateRetainerBalance(matterId, matterBalance, tx);

    const matter = await mattersQueries.findMatterById(matterId, tx);
    if (
      matter?.retainer_low_balance_threshold !== null &&
      matter?.retainer_low_balance_threshold !== undefined &&
      matter.retainer_low_balance_threshold > 0 &&
      matterBalance < matter.retainer_low_balance_threshold
    ) {
      await ctx.emit(
        RetainerLowBalance,
        {
          matter_id: matter.id,
          organization_id: matter.organization_id,
          current_balance: matterBalance,
          threshold: matter.retainer_low_balance_threshold,
        },
        tx
      );
    }
  } catch (error) {
    logger.warn('Failed to sync balance for matter {matterId}: {error}', {
      matterId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
```

- [ ] **Step 10: Rewrite `manualDeposit`**

```typescript
const manualDeposit = async (
  { data }: { data: ManualTrustData },
  ctx: ServiceContext
): Promise<SelectTrustTransaction> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('manage', 'Trust');

  return db.transaction(async (tx) => {
    const record = await recordDeposit(
      {
        organizationId: ctx.organizationId,
        clientId: data.client_id,
        matterId: data.matter_id,
        amount: data.amount,
        description: data.description ?? 'Manual trust deposit',
        source: 'manual',
        createdBy: ctx.userId,
      },
      tx
    );

    await syncBalanceAndCheckThreshold(data.matter_id, ctx.organizationId, data.client_id, ctx, tx);
    return record;
  });
};
```

- [ ] **Step 11: Rewrite `manualWithdrawal`**

```typescript
const manualWithdrawal = async (
  { data }: { data: ManualTrustData },
  ctx: ServiceContext
): Promise<SelectTrustTransaction> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('manage', 'Trust');

  return db.transaction(async (tx) => {
    const record = await recordWithdrawal(
      {
        organizationId: ctx.organizationId,
        clientId: data.client_id,
        matterId: data.matter_id,
        amount: data.amount,
        description: data.description ?? 'Manual trust withdrawal',
        source: 'manual',
        createdBy: ctx.userId,
      },
      tx
    );

    await syncBalanceAndCheckThreshold(data.matter_id, ctx.organizationId, data.client_id, ctx, tx);
    return record;
  });
};
```

---

## Task 2: Update `handlers.ts`

**Files:**
- Modify: `src/modules/trust/handlers.ts`

- [ ] **Step 1: Remove `sendResult` import and replace all handlers**

Replace the entire file content with:

```typescript
import { trustRoutes } from '@/modules/trust/routes';
import { trustService } from '@/modules/trust/services/trust.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

const {
  getTrustTransactionsRoute,
  getTrustBalanceRoute,
  getTrustReportRoute,
  createDepositRoute,
  createWithdrawalRoute,
} = trustRoutes;

const createDepositHandler: AppRouteHandler<typeof createDepositRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const body = c.req.valid('json');
  const record = await trustService.manualDeposit({ data: body }, ctx);
  return c.json(record, 201);
};

const createWithdrawalHandler: AppRouteHandler<typeof createWithdrawalRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const body = c.req.valid('json');
  const record = await trustService.manualWithdrawal({ data: body }, ctx);
  return c.json(record, 201);
};

const getTrustTransactionsHandler: AppRouteHandler<typeof getTrustTransactionsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');
  const txs = await trustService.getTransactions(
    {
      organizationId: ctx.organizationId,
      clientId: query.client_id,
      matterId: query.matter_id,
      startDate: query.start_date ? new Date(query.start_date) : undefined,
      endDate: query.end_date ? new Date(query.end_date) : undefined,
    },
    ctx
  );
  return c.json(txs, 200);
};

const getTrustBalanceHandler: AppRouteHandler<typeof getTrustBalanceRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');
  const balance = await trustService.getBalance(
    { organizationId: ctx.organizationId, clientId: query.client_id },
    ctx
  );
  return c.json(balance, 200);
};

const getTrustReportHandler: AppRouteHandler<typeof getTrustReportRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');
  const report = await trustService.getReport(
    {
      organizationId: ctx.organizationId,
      startDate: query.start_date ? new Date(query.start_date) : undefined,
      endDate: query.end_date ? new Date(query.end_date) : undefined,
    },
    ctx
  );
  return c.json(report, 200);
};

export const handlers = {
  createDepositHandler,
  createWithdrawalHandler,
  getTrustTransactionsHandler,
  getTrustBalanceHandler,
  getTrustReportHandler,
};
```

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
