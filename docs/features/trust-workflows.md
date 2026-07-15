# Trust workflow boundary

The trust module owns the complete ledger workflow for deposits and withdrawals. Callers provide the business facts and a service context; they do not acquire locks, calculate balances, update matter balance caches, or evaluate low-balance thresholds.

## Public write interface

```ts
trustService.recordDeposit(params, ctx)
trustService.recordWithdrawal(params, ctx)
trustService.manualDeposit({ data }, ctx)
trustService.manualWithdrawal({ data }, ctx)
```

Each record operation atomically:

1. acquires the organization/client/matter trust lock;
2. validates the resulting balance;
3. writes the ledger transaction;
4. synchronizes the matter's cached retainer balance when a matter is present; and
5. emits `matter.retainer_low_balance` when the resulting balance is below the configured positive threshold.

Raw balance reads used by the workflow remain private to the trust module. HTTP callers use the authorized read methods (`getBalance`, `getTransactions`, `getReport`, and `getClientBalances`).
