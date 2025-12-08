# Metered Billing Implementation Guide

## Overview

This guide explains the database-driven hybrid metered billing system that combines Better Auth's subscription SDK with lazy-loaded metered products.

## Architecture

### Key Components

1. **Better Auth SDK** - Handles base subscription creation and management
2. **Database-Driven Configuration** - Metered items stored in `subscription_plans.metered_items`
3. **Lazy Attachment** - Metered products attach automatically when features are first used
4. **Fire-and-Forget** - Billing doesn't block feature usage

### How It Works

```
1. Client creates subscription using Better Auth SDK
   └─> Base product attached (e.g., "Professional Plan - $99/month")

2. User invites a team member
   └─> reportMeteredUsage() called automatically
       └─> Checks plan's meteredItems configuration
           └─> Finds "metered_users" price ID
               └─> Attaches price to subscription (first time only)
                   └─> Reports +1 usage to Stripe

3. Stripe bills at end of billing cycle
   └─> Base: $99
   └─> Metered users: $10 × 3 users = $30
   └─> Total: $129
```

## Database Schema

### subscription_plans.metered_items

```sql
-- Example metered_items JSONB structure
[
  {
    "priceId": "price_1234_metered_users",
    "meterName": "user_seat",
    "type": "metered_users"
  },
  {
    "priceId": "price_5678_metered_payments",
    "meterName": "payment_processed",
    "type": "metered_custom_payment_fee"
  }
]
```

### Standard Metered Types

| Type | Constant | Usage |
|------|----------|-------|
| `metered_users` | `METERED_TYPES.USER_SEAT` | Per active user/member |
| `metered_invoice_fee` | `METERED_TYPES.INVOICE_FEE` | Per invoice created |
| `metered_custom_payment_fee` | `METERED_TYPES.PAYMENT_FEE` | Per payment processed |
| `metered_payout_fee` | `METERED_TYPES.PAYOUT_FEE` | Per payout initiated |

## Setup Guide

### 1. Create Metered Products in Stripe Dashboard

1. Go to **Products** → **Add product**
2. Name: "Additional User Seat" (or similar)
3. Pricing model: **Usage-based**
4. Billing period: **Monthly** (matches base subscription)
5. Unit price: e.g., $10 per user
6. Copy the **Price ID** (e.g., `price_abc123`)

Repeat for each metered product type you want.

### 2. Configure Subscription Plans

Update your subscription plan in the database to include metered items:

```sql
UPDATE subscription_plans
SET metered_items = '[
  {
    "priceId": "price_abc123_metered_users",
    "meterName": "user_seat",
    "type": "metered_users"
  },
  {
    "priceId": "price_def456_metered_payments",
    "meterName": "payment_processed",
    "type": "metered_custom_payment_fee"
  }
]'::jsonb
WHERE name = 'professional';
```

Or via the sync script:

```bash
pnpm run sync:plans
```

### 3. Test the Flow

See "Testing" section below.

## Usage in Code

### Reporting Metered Usage

```typescript
import { reportMeteredUsage } from '@/modules/subscriptions/services/meteredProducts.service';
import { METERED_TYPES } from '@/modules/subscriptions/constants/meteredProducts';
import { db } from '@/shared/database';

// Fire-and-forget pattern (won't block feature if billing fails)
void reportMeteredUsage(
  db,
  organizationId,
  METERED_TYPES.USER_SEAT,
  1, // quantity
);
```

### Getting Current Usage

```typescript
import { getCurrentUsage } from '@/modules/subscriptions/services/meteredProducts.service';

const usage = await getCurrentUsage(db, organizationId);
// Returns: [
//   { meterName: 'user_seat', quantity: 3, description: 'Additional User Seat' },
//   { meterName: 'payment_processed', quantity: 15, description: 'Payment Processing Fee' }
// ]
```

### Adding Metered Billing to New Features

```typescript
// Example: Adding metered billing to invoice creation
export const createInvoice = async (data: CreateInvoiceData) => {
  // 1. Create the invoice (main feature logic)
  const invoice = await invoiceRepository.create(data);

  // 2. Report metered usage (fire-and-forget)
  void reportMeteredUsage(
    db,
    data.organizationId,
    METERED_TYPES.INVOICE_FEE,
    1,
  );

  return invoice;
};
```

## Current Integrations

| Feature | Location | Metered Type | Trigger Event |
|---------|----------|--------------|---------------|
| Team Members | `practice/services/invitations.service.ts` | `USER_SEAT` | Invitation accepted |
| Payments | `payments/services/payments.service.ts` | `PAYMENT_FEE` | Payment intent created |

## Testing

### Manual Test Flow

1. **Create subscription via Better Auth SDK**:
```bash
# Client-side
await authClient.stripe.upgradeSubscription({
  planId: 'uuid-of-plan',
  successUrl: '/dashboard',
})
```

2. **Trigger a metered feature** (e.g., invite a member):
```bash
curl -X POST https://your-api.com/api/practice/{org-id}/invitations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email": "newuser@example.com", "role": "member"}'
```

3. **Verify metered product attached**:
   - Go to Stripe Dashboard → Subscriptions
   - Find the subscription
   - Check "Items" tab - you should see both:
     - Base product (e.g., "Professional Plan")
     - Metered product (e.g., "Additional User Seat")

4. **Verify usage recorded**:
   - Click on metered item
   - View "Usage" - should show quantity: 1

5. **Check database**:
```sql
-- Check subscription line items
SELECT * FROM subscription_line_items 
WHERE subscription_id = 'your-subscription-id';

-- Should show:
-- - base_fee item (quantity: 1)
-- - metered_users item (quantity: 1)
```

### Automated Test

```bash
pnpm run test:metered
```

(See test script below)

## Error Handling

### Silent Failures

Metered billing is designed to fail gracefully:

```typescript
try {
  await reportMeteredUsage(...);
} catch (error) {
  // Logged but not thrown
  // Feature continues to work even if billing fails
}
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "No active subscription" | User hasn't subscribed | Expected - no usage reported |
| "Metered item type not configured" | Plan's `meteredItems` doesn't include this type | Add to plan config or ignore |
| "Stripe subscription ID not found" | Better Auth subscription incomplete | Check Better Auth webhook processing |

## Best Practices

### ✅ Do

- Use fire-and-forget pattern (`void reportMeteredUsage(...)`)
- Configure metered items in database, not environment variables
- Test billing flow in Stripe test mode first
- Monitor logs for billing errors (won't block features but should be tracked)

### ❌ Don't

- Don't `await` metered usage reporting (it will block features)
- Don't throw errors if billing fails (features should work regardless)
- Don't hard-code price IDs in code (use database configuration)
- Don't report usage for orgs without active subscriptions (handled automatically)

## Monitoring

### Key Metrics to Track

1. **Attachment Success Rate**: How often metered products successfully attach
2. **Usage Reporting Success Rate**: How often usage is successfully reported to Stripe
3. **Billing Errors**: Track failures in logs

### Logs to Watch

```bash
# Success
✅ Attached metered product: user_seat to organization abc-123
📊 Usage reported: user_seat +1 (org: abc-123)

# Info
No metered items configured for organization: abc-123
Metered item type "metered_invoice_fee" not configured for organization: abc-123

# Errors
Failed to report metered usage for metered_users: Error: ...
```

## IOLTA Compliance

The metered billing system maintains IOLTA compliance by:

1. **Platform billing separate from client funds**: All metered items bill through the main Stripe account
2. **No client fund commingling**: Connected accounts (IOLTA accounts) are never charged platform fees
3. **Transparent billing**: All usage tracked and itemized on organization's invoice

## Future Enhancements

- [ ] Usage limits and alerts
- [ ] Real-time usage dashboard
- [ ] Webhook-based usage reporting
- [ ] Usage-based pricing tiers
- [ ] Prepaid usage credits

## Support

For issues or questions:
1. Check logs for error details
2. Verify Stripe Dashboard shows expected products/usage
3. Check database `subscription_line_items` table
4. Review Better Auth subscription status in `subscriptions` table

