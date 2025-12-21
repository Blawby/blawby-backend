# Frontend Subscription Implementation Guide

Complete guide for implementing subscriptions using Better Auth client SDK in the frontend.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Add Stripe Plugin to Existing Setup](#add-stripe-plugin-to-existing-setup)
3. [Fetch Available Plans](#fetch-available-plans)
4. [Create Subscription](#create-subscription)
5. [Complete Example](#complete-example)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)

---

## Prerequisites

Before implementing subscriptions, ensure you have:

1. **Better Auth client already configured** (login/register working)
2. **User authenticated** and session available
3. **Organization plugin** added to your auth client (if not already)
4. **API endpoints configured** to point to `staging-api.blawby.com` (or your staging server)

**Important**: This guide assumes:
- Frontend runs on `localhost` (development)
- Backend API runs on `staging-api.blawby.com`
- CORS is properly configured on the backend to allow requests from localhost

## Quick Start (Simplified)

**The simplest way to create a subscription:**

```typescript
// Just call upgrade - everything else is automatic!
await authClient.subscription.upgrade({
  plan: 'professional',
  successUrl: '/dashboard',
  cancelUrl: '/pricing',
});
```

**What happens automatically:**
- ✅ Organization is created if user has none
- ✅ First available org is selected if user has orgs
- ✅ Duplicate subscriptions are prevented
- ✅ Customer ID is synced to organization

**No need to:**
- ❌ Call practices API to create organization
- ❌ Check for existing subscriptions manually
- ❌ Handle organization creation logic

---

## Add Stripe Plugin to Existing Setup

Since you already have Better Auth setup, you just need to add the Stripe plugin.

### 1. Install Stripe Plugin

```bash
npm install @better-auth/stripe
```

### 2. Update Your Existing Auth Client

Add the Stripe client plugin to your existing `authClient` configuration:

```typescript
// src/lib/authClient.ts (update your existing file)
import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';
import { stripeClient } from '@better-auth/stripe/client';
// ... your existing imports

// Use staging API URL for Better Auth
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_SERVER_URL || 'https://staging-api.blawby.com';

export const authClient = createAuthClient({
  baseURL: AUTH_BASE_URL, // Points to staging-api.blawby.com
  plugins: [
    organizationClient(), // Add if not already present
    stripeClient({
      subscription: true, // Enable subscription management
    }),
    // ... any other plugins you already have
  ],
  // ... rest of your existing configuration
});
```

### 3. Environment Variables

Make sure your `.env` file points to the staging API:

```bash
# .env.local (for local development)
VITE_AUTH_SERVER_URL=https://staging-api.blawby.com
VITE_API_BASE_URL=https://staging-api.blawby.com
```

**Note**: Since your frontend runs on `localhost` and the API is on `staging-api.blawby.com`, make sure:
- CORS is properly configured on the backend (should already be handled)
- All API calls use the staging URL, not localhost

That's it! Your existing auth client will now support subscriptions.

---

## Organization Auto-Creation

**Good News**: Organizations are automatically created when you attempt to subscribe! You no longer need to call the practices API first.

### How It Works

When you call `authClient.subscription.upgrade()` without providing a `referenceId` (organization ID):

1. **If user has no organizations**: A new organization is automatically created with the name `"{user's name}'s org"` (e.g., "John's org")
2. **If user has organizations**: The first organization without an active subscription is used, or the first organization if all have subscriptions
3. **If `referenceId` is provided**: That specific organization is used (existing behavior)
4. **If active subscription exists**: The middleware automatically includes `subscriptionId` to upgrade instead of creating a duplicate

### Optional: Pre-create Organization

If you want to create an organization before subscribing (for custom naming, etc.), you can still use the practices API:

```typescript
// src/utils/createOrganization.ts
import { authClient } from '@/lib/authClient';
import { apiClient } from '@/lib/apiClient'; // Your configured API client

interface CreateOrganizationParams {
  userName: string; // User's display name
}

export const createOrganizationForSubscription = async ({
  userName,
}: CreateOrganizationParams) => {
  try {
    // Generate organization name and slug
    const orgName = `${userName}'s org`;
    const orgSlug = `${userName.toLowerCase().replace(/\s+/g, '-')}-org`;

    // Create organization via practices API
    const response = await apiClient.post('/api/practice', {
      name: orgName,
      slug: orgSlug,
    });

    if (response.data?.practice) {
      const organization = response.data.practice;

      // Set as active organization
      await authClient.organization.setActive({
        organizationId: organization.id,
      });

      return organization;
    }

    throw new Error('Failed to create organization');
  } catch (error) {
    console.error('Error creating organization:', error);
    throw error;
  }
};
```

### Alternative: Using Better Auth Directly

You can also create an organization directly using Better Auth:

```typescript
// Create organization using Better Auth client
const { data: organization, error } = await authClient.organization.create({
  name: `${userName}'s org`,
  slug: `${userName.toLowerCase().replace(/\s+/g, '-')}-org`,
});

if (error) {
  console.error('Failed to create organization:', error);
  return;
}

// Set as active organization
await authClient.organization.setActive({
  organizationId: organization.id,
});
```

---

## Fetch Available Plans

Before creating a subscription, you can fetch available plans from the API to display them dynamically.

### Fetch Plans API

```typescript
// src/utils/fetchPlans.ts
import { apiClient } from '@/lib/apiClient'; // Your configured API client (points to staging-api.blawby.com)

export interface SubscriptionPlan {
  id: string;
  name: string;
  displayName: string;
  description: string;
  stripeProductId: string;
  stripeMonthlyPriceId: string;
  stripeYearlyPriceId: string;
  monthlyPrice: string;
  yearlyPrice: string;
  currency: string;
  features: string[];
  limits: {
    users?: number;
    invoices_per_month?: number;
    storage_gb?: number;
  };
  meteredItems?: Array<{
    priceId: string;
    meterName: string;
    type: string;
  }>;
  isActive: boolean;
  isPublic: boolean;
}

export const fetchPlans = async (): Promise<SubscriptionPlan[]> => {
  try {
    const response = await apiClient.get('/api/subscriptions/plans');
    return response.data?.plans || [];
  } catch (error) {
    console.error('Error fetching plans:', error);
    throw error;
  }
};
```

### Usage in Component

```typescript
// src/components/PricingPage.tsx
import { useEffect, useState } from 'react';
import { fetchPlans, type SubscriptionPlan } from '@/utils/fetchPlans';
import { SubscribeButton } from '@/components/SubscribeButton';

export default function PricingPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const availablePlans = await fetchPlans();
        // Filter to only show active, public plans
        const publicPlans = availablePlans.filter(
          (plan) => plan.isActive && plan.isPublic
        );
        setPlans(publicPlans);
      } catch (error) {
        console.error('Failed to load plans:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPlans();
  }, []);

  if (loading) {
    return <div>Loading plans...</div>;
  }

  return (
    <div className="pricing-grid">
      {plans.map((plan) => (
        <div key={plan.id} className="plan-card">
          <h2>{plan.displayName}</h2>
          <p>{plan.description}</p>
          <div className="price">
            <span className="monthly">${plan.monthlyPrice}/month</span>
            <span className="yearly">${plan.yearlyPrice}/year</span>
          </div>
          <ul className="features">
            {plan.features.map((feature, idx) => (
              <li key={idx}>{feature}</li>
            ))}
          </ul>
          <SubscribeButton plan={plan.name} />
          <SubscribeButton plan={plan.name} annual={true} />
        </div>
      ))}
    </div>
  );
}
```

---

## Create Subscription

You can create a subscription using Better Auth's subscription API. Organizations are automatically created if needed.

### Basic Subscription Creation

**Simplified**: Just call Better Auth's subscription upgrade - organization is auto-created by middleware if needed!

```typescript
// src/utils/createSubscription.ts
import { authClient } from '@/lib/authClient';

interface CreateSubscriptionParams {
  plan: string; // Plan name (e.g., "professional", "business_seat")
  successUrl?: string;
  cancelUrl?: string;
  annual?: boolean;
}

export const createSubscription = async ({
  plan,
  successUrl = `${window.location.origin}/dashboard`,
  cancelUrl = `${window.location.origin}/pricing`,
  annual = false,
}: CreateSubscriptionParams) => {
  try {
    // Just call Better Auth - middleware handles org creation automatically!
    const { data, error } = await authClient.subscription.upgrade({
      plan,
      // referenceId is optional - middleware auto-creates org if omitted
      successUrl,
      cancelUrl,
      annual,
      disableRedirect: false, // Set to true if you want to handle redirect manually
    });

    if (error) {
      console.error('Subscription error:', error);
      throw new Error(error.message || 'Failed to create subscription');
    }

    // If disableRedirect is false, user will be automatically redirected
    // If disableRedirect is true, data.url contains the checkout URL
    if (data?.url) {
      window.location.href = data.url;
    }

    return data;
  } catch (error) {
    console.error('Error creating subscription:', error);
    throw error;
  }
};
```

### Check for Existing Subscription (Optional)

**Note**: The middleware automatically prevents duplicate subscriptions by including `subscriptionId` if an active subscription exists. However, you can still check and handle it explicitly if needed:

```typescript
// Optional: Check for existing subscription
// The middleware will automatically handle this, but you can check explicitly
const { data: subscriptions } = await authClient.subscription.list({
  referenceId: organizationId, // Optional - omit to auto-create org
});

const activeSubscription = subscriptions?.find(
  (sub) => sub.status === 'active' || sub.status === 'trialing',
);

// Even if active subscription exists, middleware will auto-include subscriptionId
// But you can include it explicitly for clarity:
await authClient.subscription.upgrade({
  plan: 'professional',
  // referenceId: organizationId, // Optional - middleware auto-creates if omitted
  subscriptionId: activeSubscription?.id, // Optional - middleware adds this automatically
  successUrl: '/dashboard',
  cancelUrl: '/pricing',
});
```

---

## Complete Example

Here's a complete React component that handles the entire flow:

```typescript
// src/components/SubscribeButton.tsx
import { useState } from 'react';
import { useRouter } from 'next/navigation'; // or your router
import { authClient } from '@/lib/authClient';
import { apiClient } from '@/lib/apiClient';

interface SubscribeButtonProps {
  plan: string; // Plan name (e.g., "professional", "business_seat")
  annual?: boolean;
}

export const SubscribeButton = ({ plan, annual = false }: SubscribeButtonProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubscribe = async () => {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Get current session
      const { data: session } = await authClient.getSession();

      if (!session?.user) {
        router.push('/login');
        return;
      }

      // Step 2: Create subscription
      // Organization will be auto-created if user has none (handled by middleware)
      // Middleware also prevents duplicate subscriptions automatically
      // Note: successUrl and cancelUrl should point to your frontend domain
      // Since frontend runs on localhost, use localhost URLs
      const { data, error: subscriptionError } = await authClient.subscription.upgrade({
        plan,
        // referenceId is optional - middleware auto-creates org if omitted
        // subscriptionId is optional - middleware auto-includes if active subscription exists
        successUrl: `${window.location.origin}/dashboard`, // localhost:3000/dashboard
        cancelUrl: `${window.location.origin}/pricing`, // localhost:3000/pricing
        annual,
        disableRedirect: false, // Auto-redirect to Stripe Checkout
      });

      if (subscriptionError) {
        setError(subscriptionError.message || 'Failed to create subscription');
        setLoading(false);
        return;
      }

      // User will be automatically redirected to Stripe Checkout
      // If disableRedirect is true, you can manually redirect:
      // if (data?.url) {
      //   window.location.href = data.url;
      // }
    } catch (err) {
      console.error('Subscription error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleSubscribe}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
      >
        {loading ? 'Processing...' : `Subscribe to ${plan}`}
      </button>
      {error && (
        <p className="mt-2 text-red-600 text-sm">{error}</p>
      )}
    </div>
  );
};
```

### Usage with Plans API

```tsx
// In your pricing page or component
import { useEffect, useState } from 'react';
import { SubscribeButton } from '@/components/SubscribeButton';
import { fetchPlans, type SubscriptionPlan } from '@/utils/fetchPlans';

export default function PricingPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const availablePlans = await fetchPlans();
        const publicPlans = availablePlans.filter(
          (plan) => plan.isActive && plan.isPublic
        );
        setPlans(publicPlans);
      } catch (error) {
        console.error('Failed to load plans:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPlans();
  }, []);

  if (loading) {
    return <div>Loading plans...</div>;
  }

  return (
    <div>
      <h1>Choose Your Plan</h1>
      
      {plans.map((plan) => (
        <div key={plan.id} className="plan-card">
          <h2>{plan.displayName}</h2>
          <p>{plan.description}</p>
          <div className="price">
            <span>${plan.monthlyPrice}/month</span>
            <span>or ${plan.yearlyPrice}/year</span>
          </div>
          <ul>
            {plan.features.map((feature, idx) => (
              <li key={idx}>{feature}</li>
            ))}
          </ul>
          <SubscribeButton plan={plan.name} />
          <SubscribeButton plan={plan.name} annual={true} />
        </div>
      ))}
    </div>
  );
}
```

---

## Error Handling

### Common Errors and Solutions

#### 1. Missing Organization

```typescript
if (!organizationId) {
  // Create organization first
  await createOrganizationForSubscription({ userName });
}
```

#### 2. Duplicate Subscription

```typescript
// Always check for existing subscription
const { data: subscriptions } = await authClient.subscription.list({
  referenceId: organizationId,
});

const activeSubscription = subscriptions?.find(
  (sub) => sub.status === 'active' || sub.status === 'trialing',
);

// Provide subscriptionId when upgrading
await authClient.subscription.upgrade({
  plan: 'professional',
  referenceId: organizationId,
  subscriptionId: activeSubscription?.id, // ⚠️ REQUIRED
  // ...
});
```

#### 3. Invalid Plan Name

```typescript
// Make sure the plan name matches exactly what's configured in Stripe
// Common plan names: "starter", "professional", "business_seat", etc.
```

#### 4. Authentication Errors

```typescript
const { data: session } = await authClient.getSession();

if (!session?.user) {
  // Redirect to login
  router.push('/login');
  return;
}
```

---

## Best Practices

### 1. Always Check for Organization

```typescript
// Before creating subscription, ensure organization exists
const { data: session } = await authClient.getSession();
const organizationId = session?.session?.activeOrganizationId;

if (!organizationId) {
  // Create organization first
  await createOrganizationForSubscription({ userName });
}
```

### 2. Handle Existing Subscriptions

```typescript
// Always check for existing subscriptions to avoid duplicates
const { data: subscriptions } = await authClient.subscription.list({
  referenceId: organizationId,
});

const activeSubscription = subscriptions?.find(
  (sub) => sub.status === 'active' || sub.status === 'trialing',
);
```

### 3. Provide Subscription ID When Upgrading

```typescript
// If user has active subscription, provide subscriptionId
await authClient.subscription.upgrade({
  plan: 'professional',
  referenceId: organizationId,
  subscriptionId: activeSubscription?.id, // ⚠️ Prevents duplicate charges
  // ...
});
```

### 4. Use Proper URLs for Redirects

```typescript
// Use absolute URLs for success and cancel URLs
// These should point to your frontend domain (localhost in dev, production domain in prod)
const successUrl = `${window.location.origin}/dashboard`;
const cancelUrl = `${window.location.origin}/pricing`;

// Example:
// Development: http://localhost:3000/dashboard
// Production: https://app.blawby.com/dashboard
```

### 5. Handle Loading States

```typescript
const [loading, setLoading] = useState(false);

// Show loading indicator during subscription creation
{loading && <Spinner />}
```

### 6. Error Handling

```typescript
try {
  const { data, error } = await authClient.subscription.upgrade({
    // ...
  });

  if (error) {
    // Handle error appropriately
    console.error('Subscription error:', error);
    showErrorToast(error.message);
    return;
  }

  // Handle success
} catch (err) {
  // Handle unexpected errors
  console.error('Unexpected error:', err);
  showErrorToast('An unexpected error occurred');
}
```

### 7. Organization Auto-Creation

Organizations are automatically created when needed:
- **Auto-naming**: Uses `"{user's name}'s org"` format
- **No frontend code needed**: Just call `subscription.upgrade()` without `referenceId`
- **Smart selection**: Uses first org without subscription, or first org if all have subscriptions
- **Duplicate prevention**: Middleware automatically includes `subscriptionId` if active subscription exists

```typescript
// Simplest approach - just call upgrade, org is auto-created
await authClient.subscription.upgrade({
  plan: 'professional',
  // No referenceId needed - middleware handles it
  successUrl: '/dashboard',
  cancelUrl: '/pricing',
});
```

### 8. Organization Naming Convention

```typescript
// Follow the pattern: "{user's name}'s org"
const orgName = `${userName}'s org`;
const orgSlug = `${userName.toLowerCase().replace(/\s+/g, '-')}-org`;
```

---

## Flow Diagram

```
User clicks "Subscribe"
    ↓
Check if user is authenticated
    ├─ NO → Redirect to /login
    └─ YES → Continue
        ↓
Call authClient.subscription.upgrade()
    ↓
[Middleware] Auto-creates/selects organization
    ├─ No orgs → Creates "{user}'s org"
    ├─ Has orgs → Uses first without subscription
    └─ Active sub exists → Auto-includes subscriptionId
        ↓
Better Auth creates Stripe Checkout Session
    ↓
[Middleware] Syncs customer ID to organization
    ↓
User redirected to Stripe Checkout
    ↓
User completes payment
    ↓
Stripe webhook processes subscription
    ↓
User redirected to successUrl
```

**Simplified Flow**: No need to check for organizations or create them manually - the middleware handles everything automatically!

---

## API Reference

### Better Auth Subscription Methods

#### `subscription.upgrade()`

Creates or upgrades a subscription. Organizations are automatically created if `referenceId` is omitted.

```typescript
await authClient.subscription.upgrade({
  plan: string,                    // Required: Plan name
  referenceId?: string,             // Optional: Organization ID (auto-created if omitted)
  subscriptionId?: string,         // Optional: Existing subscription ID (auto-included if active sub exists)
  successUrl: string,               // Required: Success redirect URL
  cancelUrl: string,                // Required: Cancel redirect URL
  annual?: boolean,                 // Optional: Annual billing
  seats?: number,                   // Optional: Number of seats
  disableRedirect?: boolean,        // Optional: Disable auto-redirect
  metadata?: Record<string, any>,   // Optional: Custom metadata
});
```

**Note**: 
- If `referenceId` is omitted, middleware auto-creates an organization named `"{user's name}'s org"`
- If an active subscription exists, middleware automatically includes `subscriptionId` to prevent duplicates

#### `subscription.list()`

Lists subscriptions for a reference ID.

```typescript
const { data: subscriptions } = await authClient.subscription.list({
  referenceId?: string, // Optional: Organization ID (omit to list all user's subscriptions)
});
```

#### `subscription.cancel()`

Cancels a subscription.

```typescript
await authClient.subscription.cancel({
  subscriptionId: string, // Subscription ID
});
```

### Plans API

#### `GET /api/subscriptions/plans`

Fetches all available subscription plans.

```typescript
const response = await apiClient.get('/api/subscriptions/plans');

// Response structure:
{
  plans: [
    {
      id: string,                    // Plan UUID
      name: string,                   // Plan name (e.g., "professional")
      displayName: string,            // Display name (e.g., "Professional Plan")
      description: string,            // Plan description
      stripeProductId: string,        // Stripe product ID
      stripeMonthlyPriceId: string,   // Stripe monthly price ID
      stripeYearlyPriceId: string,    // Stripe yearly price ID
      monthlyPrice: string,           // Monthly price (e.g., "99.00")
      yearlyPrice: string,            // Yearly price (e.g., "990.00")
      currency: string,               // Currency code (e.g., "usd")
      features: string[],             // Array of feature strings
      limits: {
        users?: number,
        invoices_per_month?: number,
        storage_gb?: number,
      },
      meteredItems?: Array<{
        priceId: string,
        meterName: string,
        type: string,
      }>,
      isActive: boolean,             // Whether plan is active
      isPublic: boolean,              // Whether plan is publicly visible
    }
  ]
}
```

### Practices API

#### `POST /api/practice` (Optional)

Creates a new organization (practice). **Note**: This is now optional since organizations are auto-created during subscription. Only use this if you need custom organization naming or want to create orgs before subscribing.

```typescript
const response = await apiClient.post('/api/practice', {
  name: string,    // Required: Organization name
  slug: string,    // Required: Organization slug (URL-friendly)
  logo?: string,  // Optional: Logo URL
  metadata?: object, // Optional: Custom metadata
});
```

---

## Troubleshooting

### Issue: CORS Errors (Frontend on localhost, API on staging-api.blawby.com)

**Good news**: Origin should NOT be an issue! The backend is already configured to allow localhost origins.

The `trustedOrigins` function automatically allows any `localhost` or `127.0.0.1` origin regardless of the environment:

```typescript
// From trustedOrigins.ts - automatically allows localhost
const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
if (localhostPattern.test(origin)) {
  return [origin]; // ✅ localhost is always trusted
}
```

**However**, if you still encounter CORS errors:

1. **Check CORS middleware**: The Hono CORS middleware also needs to allow localhost (it should, as it uses the same pattern)
2. **Verify environment variables**: Make sure `VITE_AUTH_SERVER_URL` and `VITE_API_BASE_URL` point to `https://staging-api.blawby.com`
3. **Check browser console**: Look for specific CORS error messages
4. **Verify NODE_ENV**: If `NODE_ENV === 'development'`, origin check is completely disabled. In staging, origin check is enabled but localhost is still allowed via `trustedOrigins`

```typescript
// Make sure your API client is configured correctly
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://staging-api.blawby.com';

export const apiClient = axios.create({
  baseURL: API_BASE_URL, // Should be staging-api.blawby.com
  // ...
});
```

### Issue: "Missing or null Origin" Error

This error occurs when making requests without proper CORS headers. Ensure:
- Your auth server has `disableOriginCheck: true` in development OR properly configured `trustedOrigins` that includes `http://localhost:*`
- You're using the correct `baseURL` in your auth client (should be `https://staging-api.blawby.com`)

### Issue: "Organization not found"

**This should no longer occur** - organizations are automatically created by the middleware. If you still see this error:
1. Check that the middleware is properly configured
2. Verify the user is authenticated
3. Check server logs for middleware errors

### Issue: Duplicate Subscriptions

**This is automatically prevented** - the middleware automatically includes `subscriptionId` if an active subscription exists. However, if you want to check explicitly:

```typescript
// Optional: Check for existing subscriptions
const { data: subscriptions } = await authClient.subscription.list({
  referenceId: organizationId, // Optional - omit to auto-create org
});

const activeSubscription = subscriptions?.find(
  (sub) => sub.status === 'active' || sub.status === 'trialing',
);

// Middleware will auto-include subscriptionId, but you can include it explicitly:
await authClient.subscription.upgrade({
  subscriptionId: activeSubscription?.id, // Optional - middleware adds this automatically
  // ...
});
```

### Issue: Plan Not Found

Ensure the plan name matches exactly what's configured in Stripe. Common plan names:
- `starter`
- `professional`
- `business_seat`
- `enterprise`

---

## Additional Resources

- [Better Auth Documentation](https://better-auth.com/docs)
- [Better Auth Stripe Plugin](https://better-auth.com/docs/plugins/stripe)
- [Better Auth Organization Plugin](https://better-auth.com/docs/plugins/organization)
- [Subscription APIs Documentation](./SUBSCRIPTION_APIS.md)
