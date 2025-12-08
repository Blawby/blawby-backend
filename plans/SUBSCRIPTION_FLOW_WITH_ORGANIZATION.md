# Subscription Flow: Organization Creation → Subscription Setup

## Problem

When user clicks "Subscribe" button, the organization might not exist yet. We need to ensure proper flow.

---

## Complete User Journey

### Step 1: User Authentication
```
User signs up / signs in
→ Better Auth creates user session
→ User has no organization yet
```

### Step 2: Organization Creation
```
User creates organization
→ POST /api/practice (or Better Auth createOrganization)
→ Organization created in database
→ User becomes owner/member of organization
→ Organization set as activeOrganizationId in session
```

### Step 3: Stripe Connect Onboarding
```
User starts Connect onboarding
→ POST /api/onboarding/connected-accounts
→ Stripe account created
→ User completes onboarding in Stripe UI
→ Webhook: account.updated → charges_enabled = true
```

### Step 4: Subscription Setup
```
After Connect onboarding completes
→ Show subscription setup screen
→ User selects plan
→ Create subscription with referenceId: organizationId
```

---

## Frontend Implementation

### Check Organization Before Subscription

```typescript
// src/components/SubscribeButton.tsx
import { authClient } from '@/lib/authClient';
import { useRouter } from 'next/navigation';

export const SubscribeButton = ({ plan }: { plan: string }) => {
  const router = useRouter();
  
  const handleSubscribe = async () => {
    try {
      // 1. Get current session
      const { data: session } = await authClient.getSession();
      
      // 2. Check if user has active organization
      const organizationId = session?.session?.activeOrganizationId;
      
      if (!organizationId) {
        // Redirect to create organization
        router.push('/onboarding/create-organization');
        return;
      }
      
      // 3. Verify organization exists (optional but recommended)
      const { data: orgs } = await authClient.organization.list();
      const org = orgs?.find(o => o.id === organizationId);
      
      if (!org) {
        router.push('/onboarding/create-organization');
        return;
      }
      
      // 4. Create subscription
      const { data, error } = await authClient.subscription.upgrade({
        plan,
        referenceId: organizationId, // ✅ Organization exists
        successUrl: `${window.location.origin}/dashboard`,
        cancelUrl: `${window.location.origin}/pricing`,
      });
      
      if (error) {
        console.error('Subscription error:', error);
        alert(error.message);
        return;
      }
      
      // 5. Redirect to Stripe Checkout (if not disabled)
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Failed to create subscription:', error);
      alert('Failed to create subscription. Please try again.');
    }
  };
  
  return (
    <button onClick={handleSubscribe}>
      Subscribe to {plan}
    </button>
  );
};
```

### Alternative: Use Custom Hook

```typescript
// src/hooks/useSubscription.ts
import { authClient } from '@/lib/authClient';
import { useState } from 'react';

export const useSubscription = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const createSubscription = async (plan: string) => {
    setLoading(true);
    setError(null);
    
    try {
      // 1. Get session and organization
      const { data: session } = await authClient.getSession();
      const organizationId = session?.session?.activeOrganizationId;
      
      if (!organizationId) {
        throw new Error('No active organization. Please create an organization first.');
      }
      
      // 2. Create subscription
      const { data, error: subError } = await authClient.subscription.upgrade({
        plan,
        referenceId: organizationId,
        successUrl: `${window.location.origin}/dashboard`,
        cancelUrl: `${window.location.origin}/pricing`,
      });
      
      if (subError) {
        throw new Error(subError.message);
      }
      
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create subscription';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };
  
  return { createSubscription, loading, error };
};
```

---

## Backend: Custom Endpoint (If Needed)

If you want to add validation or custom logic:

```typescript
// src/modules/subscriptions/http.ts
import { OpenAPIHono } from '@hono/zod-openapi';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';

const subscriptionsApp = new OpenAPIHono<AppContext>();

/**
 * POST /api/subscriptions/create
 * Create subscription for active organization
 */
subscriptionsApp.post('/create', requireAuth(), async (c) => {
  const user = c.get('user')!;
  const organizationId = c.get('activeOrganizationId');
  const body = await c.req.json();
  
  // 1. Verify organization exists
  if (!organizationId) {
    return c.json({ 
      error: 'No active organization',
      message: 'Please create an organization first',
      redirectTo: '/onboarding/create-organization',
    }, 400);
  }
  
  // 2. Optional: Verify organization in database
  const authInstance = createBetterAuthInstance(db);
  const { data: orgs } = await authInstance.api.listOrganizations({
    headers: c.req.raw.headers,
  });
  
  const org = orgs?.find(o => o.id === organizationId);
  if (!org) {
    return c.json({ 
      error: 'Organization not found',
      message: 'Please create an organization first',
      redirectTo: '/onboarding/create-organization',
    }, 404);
  }
  
  // 3. Optional: Verify Connect account exists (for IOLTA compliance)
  const connectedAccount = await getConnectedAccount(organizationId);
  if (!connectedAccount) {
    return c.json({ 
      error: 'Stripe Connect account not set up',
      message: 'Please complete Stripe Connect onboarding first',
      redirectTo: '/onboarding/connect',
    }, 400);
  }
  
  // 4. Create subscription using Better Auth API
  const result = await authInstance.api.upgradeSubscription({
    body: {
      plan: body.plan || 'starter',
      referenceId: organizationId,
      successUrl: body.successUrl || '/dashboard',
      cancelUrl: body.cancelUrl || '/pricing',
      disableRedirect: body.disableRedirect || false,
    },
    headers: c.req.raw.headers,
  });
  
  if (result.error) {
    return c.json({ error: result.error.message }, 400);
  }
  
  return c.json({
    subscriptionId: result.data?.subscriptionId,
    checkoutUrl: result.data?.url,
  });
});

export default subscriptionsApp;
```

---

## Recommended Flow

### Option 1: Frontend-Only (Simplest)

**Use Better Auth client directly, but check organization first:**

```typescript
// Frontend component
const handleSubscribe = async () => {
  // 1. Check organization exists
  const { data: session } = await authClient.getSession();
  const orgId = session?.session?.activeOrganizationId;
  
  if (!orgId) {
    router.push('/onboarding/create-organization');
    return;
  }
  
  // 2. Create subscription
  await authClient.subscription.upgrade({
    plan: 'pro',
    referenceId: orgId,
    successUrl: '/dashboard',
    cancelUrl: '/pricing',
  });
};
```

**Pros:**
- ✅ Simple - no custom backend needed
- ✅ Uses Better Auth's built-in endpoints
- ✅ Automatic webhook handling

**Cons:**
- ⚠️ Less control over validation
- ⚠️ Can't add custom business logic

### Option 2: Custom Backend Endpoint (More Control)

**Create custom endpoint that validates organization first:**

```typescript
// Backend: POST /api/subscriptions/create
// Validates organization exists, then calls Better Auth API
```

**Pros:**
- ✅ Full control over validation
- ✅ Can add custom business logic
- ✅ Better error messages
- ✅ Can verify Connect account exists

**Cons:**
- ⚠️ More code to maintain
- ⚠️ Need to handle webhooks (Better Auth still does this)

---

## Implementation Recommendation

**Use Option 1 (Frontend-Only) with organization check:**

1. ✅ Check `activeOrganizationId` in session before subscription
2. ✅ Redirect to organization creation if missing
3. ✅ Use Better Auth's built-in `subscription.upgrade()` endpoint
4. ✅ Let Better Auth handle webhooks automatically

**Only use Option 2 (Custom Endpoint) if you need:**
- Custom validation (e.g., verify Connect account exists)
- Custom business logic before subscription
- Integration with your event system

---

## Flow Diagram

```
User clicks "Subscribe"
    ↓
Check activeOrganizationId in session
    ↓
Organization exists?
    ├─ NO → Redirect to /onboarding/create-organization
    └─ YES → Continue
        ↓
Call authClient.subscription.upgrade({
  referenceId: organizationId
})
    ↓
Better Auth creates Stripe Checkout Session
    ↓
User completes checkout on Stripe
    ↓
Stripe sends webhook to /api/auth/stripe/webhook
    ↓
Better Auth processes webhook
    ↓
Subscription created in database
    ↓
User redirected to successUrl
```

---

## Summary

**Answer: Check organization exists BEFORE calling subscription API.**

1. **Frontend**: Check `activeOrganizationId` in session
2. **If missing**: Redirect to organization creation
3. **If exists**: Call `authClient.subscription.upgrade()` with `referenceId: organizationId`
4. **Better Auth**: Handles subscription creation and webhooks automatically

**No custom API needed** unless you want additional validation or business logic.

