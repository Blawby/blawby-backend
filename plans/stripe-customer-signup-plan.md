# Implementation Plan: Create Stripe Customer on User Signup
## Blawby-TS - Concise Action Plan

---

## Overview

**Goal:** Automatically create a Stripe Customer on the platform account when a user signs up.

**Why:** 
- Track payment history per user
- Enable future billing/subscriptions
- IOLTA compliance audit trail
- Reuse customer for intake payments

---

## Current State Analysis

### ✅ What Exists:
- Better Auth with signup flow (`src/shared/auth/better-auth.ts`)
- `AUTH_USER_SIGNED_UP` event already published after user creation
- Users table in database (`src/schema/better-auth-schema.ts`)
- Organizations already have `stripeCustomerId` for their billing

### ❌ What's Missing:
- No `stripeCustomerId` field on users table
- No service to create Stripe customers
- No integration with signup flow

---

## Implementation Steps

### **Phase 1: Database Schema** (30 mins)

**Update:** `src/schema/better-auth-schema.ts`

Add to users table:
- `stripeCustomerId: text('stripe_customer_id').unique()`
- `stripeCustomerCreatedAt: timestamp('stripe_customer_created_at')`

**Action:**
```bash
pnpm drizzle-kit generate  # Create migration
pnpm drizzle-kit migrate   # Apply migration
```

---

### **Phase 2: Create Service** (1 hour)

**Create:** `src/shared/services/stripe-customer.service.ts`

Functions needed:
- `createStripeCustomerForUser(userId, email, name)` - Create customer on Stripe
- `getOrCreateStripeCustomer(userId, email, name)` - Get existing or create new
- `updateStripeCustomer(userId, name?, email?)` - Update customer info
- `findUserByStripeCustomerId(customerId)` - Reverse lookup

**Key Logic:**
```typescript
// Pseudo-code
async createStripeCustomerForUser({userId, email, name}) {
  // 1. Check if user already has customer
  // 2. If yes, return existing
  // 3. If no, create on Stripe with metadata: {user_id, source: 'platform_signup'}
  // 4. Update user record with stripeCustomerId
  // 5. Return customer
  // 6. DON'T throw errors - log and return null to avoid blocking signup
}
```

---

### **Phase 3: Integrate with Signup** (30 mins)

**Update:** `src/shared/auth/better-auth.ts`

**Option A: Direct in Hook (Simple)**
```typescript
user: {
  create: {
    after: async (userData) => {
      // Existing event publishing
      await publishSimpleEvent(EventType.AUTH_USER_SIGNED_UP, ...);
      
      // NEW: Create Stripe customer (async, non-blocking)
      void createStripeCustomerForUser({
        userId: userData.id,
        email: userData.email,
        name: userData.name,
      }).catch(error => {
        console.error('Failed to create Stripe customer', error);
      });
    },
  },
}
```

**Option B: Event Handler (Better for Production)**
- Create handler: `src/modules/billing/handlers/user-signup.handler.ts`
- Subscribe to `AUTH_USER_SIGNED_UP` event
- Call `createStripeCustomerForUser()` in handler
- Better observability and retry logic

---

### **Phase 4: Update Intake Payments** (1 hour)

**Update:** `src/modules/intake-payments/services/intake-payments.service.ts`

In `createIntakePayment()`:
1. Check if email belongs to registered user
2. If yes, use `getOrCreateStripeCustomer()` 
3. If no, search/create anonymous customer
4. Add `customer` parameter to payment intent
5. Store `stripeCustomerId` in intake payment record

**Schema Update:** `src/modules/intake-payments/database/schema/intake-payments.schema.ts`
- Add `stripeCustomerId: text('stripe_customer_id')`

---

### **Phase 5: Repository Layer** (30 mins)

**Create:** `src/shared/repositories/users.repository.ts`

Functions:
- `findById(userId)`
- `findByEmail(email)`
- `findByStripeCustomerId(customerId)`
- `updateStripeCustomerId(userId, customerId)`
- `getUsersWithoutStripeCustomer(limit)` - For backfill

---

### **Phase 6: Backfill Script** (Optional - 1 hour)

**Create:** `src/scripts/backfill-stripe-customers.ts`

- Get all users without `stripeCustomerId`
- Loop through and call `createStripeCustomerForUser()`
- Rate limit: 100ms delay between requests
- Log success/failures

**Add to package.json:**
```json
"scripts": {
  "backfill:stripe-customers": "tsx src/scripts/backfill-stripe-customers.ts"
}
```

---

## Key Decision Points

### 1. **Customer on Platform vs Connected Account?**
✅ **Platform Account** (your main Stripe account)

**Why:**
- User's subscription billing is on platform
- Easier to track across all organizations
- Matches Laravel implementation
- Better for IOLTA audit trail

### 2. **Blocking vs Non-Blocking?**
✅ **Non-Blocking** (use `void` or async handler)

**Why:**
- Don't fail signup if Stripe is down
- Better user experience
- Can retry later via backfill script

### 3. **Create Immediately or On-Demand?**
✅ **Immediately on Signup**

**Why:**
- Cleaner code
- Guaranteed to exist when needed
- Simpler payment flows

---

## Testing Checklist

### Manual Testing:
- [ ] New user signup creates Stripe customer
- [ ] Stripe customer ID saved to database
- [ ] Duplicate signup doesn't create duplicate customer
- [ ] Existing users can be backfilled
- [ ] Intake payments use user's customer when logged in
- [ ] Stripe failures don't block signup

### Unit Tests:
- [ ] `createStripeCustomerForUser()` creates customer
- [ ] `getOrCreateStripeCustomer()` returns existing
- [ ] Error handling doesn't throw

### Integration Tests:
- [ ] Full signup flow creates customer
- [ ] Intake payment uses correct customer

---

## Migration Strategy for Existing Users

### Option 1: Backfill Script (Recommended)
```bash
pnpm backfill:stripe-customers
```
- Run once after deployment
- Creates customers for all existing users
- Safe to re-run (idempotent)

### Option 2: Lazy Creation
- Create customer on first payment/action
- Simpler but less predictable

---

## File Checklist

### New Files:
- [ ] `src/shared/services/stripe-customer.service.ts`
- [ ] `src/shared/repositories/users.repository.ts`
- [ ] `src/scripts/backfill-stripe-customers.ts`
- [ ] `src/modules/billing/handlers/user-signup.handler.ts` (optional)

### Modified Files:
- [ ] `src/schema/better-auth-schema.ts` - Add fields to users
- [ ] `src/shared/auth/better-auth.ts` - Add customer creation
- [ ] `src/modules/intake-payments/services/intake-payments.service.ts` - Use customer
- [ ] `src/modules/intake-payments/database/schema/intake-payments.schema.ts` - Add field
- [ ] `package.json` - Add backfill script

### Database:
- [ ] Migration: Add `stripe_customer_id` to users
- [ ] Migration: Add `stripe_customer_id` to intake_payments

---

## Timeline Estimate

- **Phase 1 (Schema):** 30 minutes
- **Phase 2 (Service):** 1 hour
- **Phase 3 (Integration):** 30 minutes
- **Phase 4 (Intake Payments):** 1 hour
- **Phase 5 (Repository):** 30 minutes
- **Phase 6 (Backfill):** 1 hour
- **Testing:** 1 hour

**Total:** ~5-6 hours

---

## Critical Implementation Notes

### 1. Error Handling
```typescript
// GOOD: Non-blocking
void createStripeCustomerForUser(...).catch(console.error);

// BAD: Blocking
await createStripeCustomerForUser(...); // Don't await in signup hook
```

### 2. Idempotency
- Always check if customer exists before creating
- Safe to call multiple times
- Use unique constraint on `stripeCustomerId`

### 3. Metadata
Always add to Stripe customer:
```typescript
metadata: {
  user_id: userId,
  source: 'platform_signup',
  created_via: 'blawby_ts',
}
```

### 4. Customer Lookup
When creating intake payments:
```typescript
// 1. Check if registered user
const user = await usersRepository.findByEmail(email);

// 2. Use their customer
if (user?.stripeCustomerId) {
  customerId = user.stripeCustomerId;
} else {
  // 3. Search or create anonymous customer
  const customers = await stripe.customers.list({ email, limit: 1 });
  customerId = customers.data[0]?.id || await createAnonymousCustomer();
}
```

---

## Success Criteria

- ✅ Every new signup creates a Stripe customer
- ✅ `stripeCustomerId` stored in database
- ✅ No signup failures due to Stripe errors
- ✅ Existing users can be backfilled
- ✅ Intake payments use user's customer
- ✅ Proper error logging and monitoring

---

## Rollback Plan

If issues arise:
1. Stripe customer creation is non-blocking - won't affect signups
2. Backfill script can be re-run safely
3. Can add `stripeCustomerId` later via script if needed

**Safe to deploy incrementally!**
