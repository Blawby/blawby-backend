# Stripe Implementation - Master Plan

**Status**: In Progress
**Last Updated**: January 21, 2026
**Overall Completion**: ~45%

Complete implementation plan for Stripe Connect integration.

---

## Related Documents

- **Webhook Implementation**: `WEBHOOK_IMPLEMENTATION_PLAN.md` (✅ Production Ready)
- **Subscription System**: `STRIPE_SUBSCRIPTIONS_PLAN.md` (Platform billing - separate from Phase 3)
- **Graphile Worker Migration**: `archive/GRAPHILE_WORKER_MIGRATION.md` (✅ Completed)
- **Current Status Review**: `PLANS_REVIEW_2026-01-21.md`

---

## Overview

This implementation enables organizations to:
1. Onboard to Stripe Connect
2. Accept payments and create invoices
3. Manage subscription billing
4. Track payouts and balances

---

## Phase Breakdown

### Phase 1: Stripe Connected Account Onboarding
**Status**: ✅ ~95% Complete (Tested & Verified)
**Reference**: `WEBHOOK_IMPLEMENTATION_PLAN.md` (Production Ready)

**Goal**: Onboard organizations to Stripe Connect

**Key Deliverables**:
- ✅ Database tables: `connected_accounts`, `webhook_events`
- ✅ API routes: `/api/onboarding/connected-accounts`
- ✅ Webhook endpoint - **Tested & Verified** for:
  - Stripe Connected Account webhooks
  - Practice intake webhooks
- ✅ Services: ConnectedAccountsService, WebhooksService
- ✅ Stripe embedded onboarding component integration
- ✅ Graphile Worker for async webhook processing (see `archive/GRAPHILE_WORKER_MIGRATION.md`)

**Completed**: December 2025
**Verified**: January 2026

**Remaining** (Optional):
- Session refresh endpoint (if needed for UX improvement)

---

### Phase 2: Payment Processing & Invoicing
**Status**: ⚠️ ~40% Complete (Custom implementation differs from original plan)

**Goal**: Accept payments and create invoices

**What's Implemented**:
- ✅ Payment intents (custom implementation)
- ✅ Payment links (custom system)
- ✅ Intake payments (custom flow)
- ✅ Payment webhooks (`payment_intent.succeeded`, `charge.succeeded`, etc.)

**Still Needed**:
- ❌ Invoice management (create, list, send, update)
- ❌ Invoice PDF generation
- ❌ Refund processing
- ❌ Standard payment intent routes (or document why custom implementation)

**Dependencies**: Phase 1 complete ✅

**Note**: The codebase has a custom payment implementation that differs from the original plan.

---

### Phase 3: Subscriptions & Recurring Billing
**Status**: ❌ 0% (Use `STRIPE_SUBSCRIPTIONS_PLAN.md` instead)
**Reference**: See `STRIPE_SUBSCRIPTIONS_PLAN.md` for platform billing implementation

**Note**: This phase is for customer subscription billing (clients paying organizations).
For **platform billing** (organizations paying Blawby), see the separate `STRIPE_SUBSCRIPTIONS_PLAN.md` document which details:
- Platform customer + subscription creation
- Organization billing (separate from Connect accounts)
- IOLTA-compliant subscription system
- Metered billing and usage tracking

**Original Goal**: Manage customer subscription plans and recurring billing

**Not Started**:
- ❌ Database tables: `subscription_plans`, `subscriptions`
- ❌ API routes: `/api/subscription-plans/*`, `/api/subscriptions/*`
- ❌ Services: SubscriptionPlansService, SubscriptionsService
- ❌ MRR/ARR calculation
- ❌ Subscription lifecycle management

**Dependencies**: Phase 2 complete (not met)

---

### Phase 4: Payouts & Balance Management
**Status**: ❌ 0% (Not Started)

**Goal**: Track balances and manage payouts

**Not Started**:
- ❌ Database tables: `payouts`, `balance_transactions`
- ❌ API routes: `/api/balance/*`, `/api/payouts/*`, `/api/reports/*`
- ❌ Services: BalanceService, PayoutsService
- ❌ Financial reporting
- ❌ Balance transaction sync

**Dependencies**: Phase 2 complete (not met)

---

## Total Timeline

**Estimated Total**: 10-14 days

**Parallel Work Possible**:
- Phase 3 and Phase 4 can be done in parallel after Phase 2

**Realistic Timeline with Buffer**: 2-3 weeks

---

## Implementation Order

### Week 1: Foundation
1. Day 1-3: Phase 1 (Onboarding)
2. Day 4-5: Start Phase 2 (Payments)

### Week 2: Core Features
1. Day 1-2: Finish Phase 2 (Payments, Invoices, Refunds)
2. Day 3-5: Phase 3 (Subscriptions)

### Week 3: Advanced Features
1. Day 1-3: Phase 4 (Payouts, Balance, Reports)
2. Day 4-5: Testing, bug fixes, documentation

---

## Critical Path

The critical path (must be done in order):
1. Phase 1 (Onboarding) - Foundation
2. Phase 2 (Payments) - Core feature
3. Phase 3 OR Phase 4 - Can be parallel

---

## Testing Strategy

### Unit Tests
- Repository methods
- Service business logic
- Utility functions

### Integration Tests
- API endpoints
- Webhook handlers
- Database operations

### E2E Tests
- Complete onboarding flow
- Payment processing
- Subscription creation
- Invoice generation

### Manual Testing
- Stripe test mode
- Use Stripe CLI for webhooks
- Test all user flows

---

## Environment Setup

### Required Environment Variables

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Database
DATABASE_URL=postgresql://...

# Better Auth (already configured)
# ...existing auth vars
```

### Stripe CLI Setup

```bash
# Install
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local
stripe listen --forward-to localhost:3000/api/onboarding/webhooks/stripe

# Trigger test events
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created
```

---

## Database Migration Strategy

### Create Migrations in Order

1. **Phase 1**: connected_accounts, webhook_events
2. **Phase 2**: payments, invoices, refunds
3. **Phase 3**: subscription_plans, subscriptions
4. **Phase 4**: payouts, balance_transactions

Each phase's migrations should be in separate files for clean rollback capability.

---

## API Structure Overview

```
/api/
├── onboarding/
│   ├── connected-accounts (POST, GET)
│   ├── connected-accounts/session (POST)
│   └── webhooks/stripe (POST)
├── payments/
│   ├── intents (POST)
│   ├── / (GET)
│   └── [id]/
│       ├── / (GET)
│       └── cancel (POST)
├── invoices/
│   ├── / (GET, POST)
│   └── [id]/
│       ├── / (GET, PATCH)
│       ├── send (POST)
│       └── payment-link (POST)
├── refunds/
│   ├── / (GET, POST)
├── subscription-plans/
│   ├── / (GET, POST)
│   └── [id]/ (GET, PATCH, DELETE)
├── subscriptions/
│   ├── / (GET, POST)
│   └── [id]/
│       ├── / (GET)
│       ├── cancel (POST)
│       ├── reactivate (POST)
│       └── payment-method (POST)
├── balance/
│   ├── / (GET)
│   └── transactions/ (GET)
│       └── sync (POST)
├── payouts/
│   ├── / (GET, POST)
│   └── [id]/
│       ├── / (GET)
│       └── cancel (POST)
└── reports/
    ├── revenue (GET)
    ├── fees (GET)
    └── customers (GET)
```

---

## Common Patterns

### Service Layer Pattern
```typescript
export class XyzService {
  constructor(
    private repo: XyzRepository,
    private stripe: StripeClientService
  ) {}
  
  async create(orgId: string, data: CreateData) {
    // 1. Validate
    // 2. Create in Stripe
    // 3. Save to DB
    // 4. Return result
  }
  
  async get(orgId: string, id: string) {
    // 1. Find in DB
    // 2. Verify ownership (orgId)
    // 3. Return
  }
}
```

### Repository Pattern
```typescript
export class XyzRepository {
  constructor(private db: Database) {}
  
  async create(data: InsertData) {
    return this.db.insert(table).values(data).returning();
  }
  
  async findById(id: string) {
    return this.db.query.table.findFirst({ where: eq(table.id, id) });
  }
  
  async findByOrganization(orgId: string) {
    return this.db.query.table.findMany({ where: eq(table.organization_id, orgId) });
  }
}
```

### Route Handler Pattern
```typescript
export async function POST(req: Request) {
  try {
    // 1. Get session
    const session = await getSession();
    const orgId = session.user.organization.id;
    
    // 2. Validate input
    const body = await req.json();
    const validated = schema.parse(body);
    
    // 3. Call service
    const result = await service.create(orgId, validated);
    
    // 4. Return response
    return Response.json(result);
  } catch (error) {
    // Handle errors
    return Response.json({ error: error.message }, { status: 400 });
  }
}
```

---

## Key Implementation Principles

1. **Always use cents** - Never floats for money
2. **Verify ownership** - Check organization_id on every request
3. **Use Stripe account context** - `{ stripeAccount: accountId }` on all Stripe calls
4. **Idempotency** - Use idempotency keys for payment intents
5. **Webhook security** - Always verify signatures
6. **Error handling** - Wrap Stripe calls in try/catch
7. **Logging** - Log all Stripe interactions for debugging
8. **Soft deletes** - Use is_active flags instead of DELETE
9. **Timestamps** - Always track created_at, updated_at
10. **Indexing** - Index all foreign keys and commonly queried fields

---

## Deployment Checklist

### Before Going Live

- [ ] Test all flows in Stripe test mode
- [ ] Set up Stripe webhook endpoints in production
- [ ] Configure environment variables
- [ ] Run database migrations
- [ ] Test webhook signature verification
- [ ] Set up monitoring/alerting
- [ ] Test payout schedule
- [ ] Verify application fees are correct
- [ ] Test refund flow
- [ ] Load test payment processing
- [ ] Review Stripe dashboard settings
- [ ] Enable Stripe radar (fraud prevention)

### Switching to Live Mode

1. Get live mode API keys from Stripe
2. Update environment variables
3. Create new webhook endpoint for production
4. Test with small real transaction
5. Monitor for 24 hours
6. Gradually roll out to users

---

## Support & Monitoring

### Logging
- Log all Stripe API calls
- Log webhook processing
- Log payment failures
- Log refund requests

### Alerts
- Failed webhooks (>3 retries)
- Failed payments (unusual spike)
- Payout failures
- Balance below threshold
- Account suspended

### Metrics to Track
- Payment success rate
- Average transaction value
- MRR growth
- Churn rate
- Failed payment recovery rate
- Webhook processing time

---

## Security Considerations

1. **Webhook verification** - Always verify Stripe signatures
2. **API key protection** - Never expose secret keys
3. **PCI compliance** - Never store card numbers
4. **Rate limiting** - Implement on payment endpoints
5. **Authorization** - Always check organization ownership
6. **Audit logs** - Track all financial actions
7. **HTTPS only** - All communication must be encrypted

---

## Resources

- Stripe Connect Docs: https://stripe.com/docs/connect
- Stripe API Reference: https://stripe.com/docs/api
- Stripe CLI: https://stripe.com/docs/stripe-cli
- Stripe Testing: https://stripe.com/docs/testing
- Better Auth Docs: https://www.better-auth.com

---

## Quick Start

To start implementation:

1. Read PHASE_1_STRIPE_ONBOARDING.md
2. Set up Stripe test account
3. Install Stripe CLI
4. Create database migrations
5. Build Phase 1 endpoints
6. Test with Stripe embedded component
7. Move to Phase 2

Each phase document contains detailed implementation instructions for Cursor to follow.
