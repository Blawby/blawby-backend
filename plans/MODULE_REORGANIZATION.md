# Module Reorganization Plan

## Overview
Reorganize the codebase to have clearer module boundaries and better separation of concerns. Move Stripe-specific infrastructure from `shared/` to a dedicated `stripe/` module.

## Current Structure Issues

1. **Misleading naming**: `onboarding/` sounds like user onboarding, not Stripe account setup
2. **Misplaced infrastructure**: Stripe utilities in `shared/` when they're not truly shared
3. **No clear Stripe namespace**: Stripe-related code scattered across modules

## Proposed Structure

```
src/modules/
├── stripe/
│   ├── core/                           [Stripe infrastructure & utilities]
│   │   ├── services/
│   │   │   ├── stripe-client.service.ts
│   │   │   └── fees.service.ts
│   │   ├── schemas/
│   │   │   └── webhook-events.schema.ts
│   │   ├── repositories/
│   │   │   └── webhook-events.repository.ts
│   │   └── utils/
│   │       └── webhook-signature.ts
│   │
│   └── connected-accounts/              [Stripe connected account onboarding]
│       ├── database/
│       │   ├── queries/
│       │   │   └── connected-accounts.repository.ts
│       │   └── schema/
│       │       └── connected-accounts.schema.ts
│       ├── services/
│       │   ├── connected-accounts.service.ts
│       │   ├── onboarding-webhooks.service.ts
│       │   └── onboarding.service.ts
│       ├── handlers/
│       │   ├── account-updated.handler.ts
│       │   ├── capability-updated.handler.ts
│       │   ├── external-account-created.handler.ts
│       │   ├── external-account-deleted.handler.ts
│       │   ├── external-account-updated.handler.ts
│       │   └── onboarding-completed.handler.ts
│       ├── validations/
│       │   └── onboarding.validation.ts
│       ├── types/
│       │   └── onboarding.types.ts
│       ├── http.ts
│       ├── index.ts
│       └── routes.config.ts
│
├── practice/                           [Practice CRUD & management]
│   ├── database/
│   ├── services/
│   ├── validations/
│   ├── types/
│   ├── http.ts
│   ├── index.ts
│   └── routes.config.ts
│
├── payments/                           [General payment infrastructure]
│   ├── database/
│   │   ├── queries/
│   │   │   ├── payment-intents.repository.ts
│   │   │   └── payment-links.repository.ts
│   │   └── schema/
│   │       ├── payment-intents.schema.ts
│   │       └── payment-links.schema.ts
│   ├── services/
│   │   ├── payments.service.ts
│   │   └── payment-link-receipts.service.ts
│   ├── handlers/
│   │   ├── charge-succeeded.handler.ts
│   │   ├── payment-intent-canceled.handler.ts
│   │   ├── payment-intent-failed.handler.ts
│   │   └── payment-intent-succeeded.handler.ts
│   ├── validations/
│   │   └── payments.validation.ts
│   ├── types/
│   │   └── payments.types.ts
│   ├── index.ts
│   └── routes.config.ts
│
├── intake-payments/                    [Client intake payments - NEW]
│   ├── database/
│   │   ├── queries/
│   │   │   └── intake-payments.repository.ts
│   │   └── schema/
│   │       └── intake-payments.schema.ts
│   ├── services/
│   │   └── intake-payments.service.ts
│   ├── handlers/
│   │   ├── succeeded.handler.ts
│   │   ├── failed.handler.ts
│   │   └── canceled.handler.ts
│   ├── validations/
│   │   └── intake-payments.validation.ts
│   ├── types/
│   │   └── intake-payments.types.ts
│   ├── http.ts
│   ├── index.ts
│   └── routes.config.ts
│
└── public/
    ├── config.ts
    └── http.ts
```

## Migration Steps

### Phase 1: Rename `onboarding/` to `stripe/connected-accounts/`

1. Create `src/modules/stripe/connected-accounts/` directory
2. Move all files from `src/modules/onboarding/` to `src/modules/stripe/connected-accounts/`
3. Update all import paths:
   - `@/modules/onboarding/` → `@/modules/stripe/connected-accounts/`
4. Update schema exports in `src/schema/index.ts`
5. Test to ensure nothing breaks

### Phase 2: Move Stripe Infrastructure to `stripe/core/`

**Files to move:**

1. `src/shared/schemas/stripe.webhook-events.schema.ts` 
   → `src/modules/stripe/core/schemas/webhook-events.schema.ts`

2. `src/shared/services/stripe-client.service.ts` 
   → `src/modules/stripe/core/services/stripe-client.service.ts`

3. `src/shared/repositories/stripe.webhook-events.repository.ts` 
   → `src/modules/stripe/core/repositories/webhook-events.repository.ts`

4. `src/shared/services/fees.service.ts` (if Stripe-specific)
   → `src/modules/stripe/core/services/fees.service.ts`

**Update all imports:**

Before:
```typescript
import { getStripeClient } from '@/shared/services/stripe-client.service';
import { stripeWebhookEventsRepository } from '@/shared/repositories/stripe.webhook-events.repository';
import { calculateFees } from '@/shared/services/fees.service';
```

After:
```typescript
import { getStripeClient } from '@/modules/stripe/core/services/stripe-client.service';
import { webhookEventsRepository } from '@/modules/stripe/core/repositories/webhook-events.repository';
import { calculateFees } from '@/modules/stripe/core/services/fees.service';
```

### Phase 3: Add Path Aliases (Optional)

Update `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@stripe/*": ["./src/modules/stripe/*"],
      "@practice/*": ["./src/modules/practice/*"],
      "@payments/*": ["./src/modules/payments/*"]
    }
  }
}
```

Then imports become:
```typescript
import { getStripeClient } from '@stripe/core/services';
import { connectedAccountsRepository } from '@stripe/connected-accounts/database/queries';
```

## Benefits

### 1. Clear Namespacing
- All Stripe-related code under `stripe/`
- Easy to find and understand Stripe infrastructure

### 2. Better Separation of Concerns
- `shared/` contains truly shared utilities (auth, database, middleware, events)
- Stripe infrastructure in `stripe/core/`
- Business features in their own modules

### 3. Scalability
- Easy to add more Stripe features: `stripe/products/`, `stripe/subscriptions/`
- Room for other payment processors: `paypal/`, `square/`

### 4. Improved Developer Experience
- Clear module boundaries
- Easier to onboard new developers
- Reduced confusion about where code belongs

### 5. Future-Proof
- Can migrate to monorepo structure if needed
- Each module could become a package
- Clear dependencies between modules

## What Stays in `shared/`

Keep truly shared, non-Stripe-specific infrastructure:
- `shared/database/` - Database connection
- `shared/auth/` - Authentication (Better Auth)
- `shared/middleware/` - HTTP middleware
- `shared/events/` - Event system
- `shared/queue/` - Queue management (BullMQ)
- `shared/router/` - Module router
- `shared/utils/` - General utilities (logging, response utils)
- `shared/types/` - Generic TypeScript types
- `shared/validations/` - Generic validation utilities

## Testing After Migration

- [ ] Run TypeScript compiler: `npm run build`
- [ ] Run linter: `npm run lint`
- [ ] Test all API endpoints
- [ ] Test Stripe webhook handlers
- [ ] Test connected account onboarding flow
- [ ] Verify database migrations still work
- [ ] Run integration tests

## Rollback Plan

If issues arise:
1. All changes are just file moves and import updates
2. Git history preserves file moves
3. Can revert commits individually
4. No database schema changes involved

## Timeline

- **Phase 1**: 1-2 hours (rename onboarding to stripe/connected-accounts)
- **Phase 2**: 2-3 hours (move Stripe infrastructure from shared)
- **Phase 3**: 1 hour (add path aliases, optional)
- **Testing**: 1-2 hours

**Total: ~6-8 hours**

## Priority

- **Priority**: Medium
- **Urgency**: Low
- **Can be done**: Incrementally or all at once
- **Blocking**: Not blocking new feature development (intake-payments can work with current structure)

## Related Plans

- `INTAKE_PAYMENTS.md` - New feature that will use `stripe/connected-accounts/`
- `PHASE_2_PAYMENT_PROCESSING.md` - Payment processing features

## Notes

- This is primarily a refactoring effort with no functional changes
- All existing functionality should work identically after migration
- Can be done in background while developing new features
- Consider doing this before adding more Stripe-related features

