/**
 * Middleware to auto-create organization for subscription requests
 * Intercepts subscription upgrade requests and creates/selects an organization
 * if referenceId is not provided, before the request reaches Better Auth
 */

import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/schema';
import type { MiddlewareHandler } from 'hono';

const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
};

export const autoCreateOrgForSubscription = (): MiddlewareHandler => {
  return async (c, next) => {
    // Only handle subscription upgrade requests
    if (c.req.method !== 'POST' || !c.req.path.includes('/api/auth/subscription/upgrade')) {
      return next();
    }

    try {
      // Clone request to read body without consuming the original
      const clonedRequest = c.req.raw.clone();
      const body = await clonedRequest.json().catch(() => ({}));

      // If referenceId is already provided, skip
      if (body.referenceId) {
        return next();
      }

      // Get authenticated user
      const authInstance = createBetterAuthInstance(db);
      const session = await authInstance.api.getSession({
        headers: c.req.raw.headers,
      });

      if (!session?.user) {
        return next(); // Not authenticated - let Better Auth handle it
      }

      // Get or create organization
      const userId = session.user.id;
      const userMemberships = await db
        .select({ organizationId: schema.members.organizationId })
        .from(schema.members)
        .where(eq(schema.members.userId, userId));

      let organizationId: string | null = null;

      if (userMemberships.length === 0) {
        // Auto-create organization
        const [userData] = await db
          .select({ name: schema.users.name })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1);

        if (userData) {
          const orgName = `${userData.name}'s org`;
          let orgSlug = generateSlug(userData.name);

          // Ensure slug is unique
          let slugAttempt = orgSlug;
          let attemptCount = 0;
          while (attemptCount < 10) {
            const existing = await db
              .select({ id: schema.organizations.id })
              .from(schema.organizations)
              .where(eq(schema.organizations.slug, slugAttempt))
              .limit(1);

            if (existing.length === 0) {
              orgSlug = slugAttempt;
              break;
            }
            attemptCount++;
            slugAttempt = `${orgSlug}-${attemptCount}`;
          }

          organizationId = crypto.randomUUID();
          await db.insert(schema.organizations).values({
            id: organizationId,
            name: orgName,
            slug: orgSlug,
            createdAt: new Date(),
          });

          await db.insert(schema.members).values({
            id: crypto.randomUUID(),
            userId,
            organizationId,
            role: 'owner',
            createdAt: new Date(),
          });
        }
      } else {
        // Use first org without active subscription, or first org
        const orgIds = userMemberships.map((m) => m.organizationId);
        const orgsData = await db
          .select({
            id: schema.organizations.id,
            activeSubscriptionId: schema.organizations.activeSubscriptionId,
          })
          .from(schema.organizations)
          .where(inArray(schema.organizations.id, orgIds));

        organizationId = orgsData.find((org) => !org.activeSubscriptionId)?.id
          || orgsData[0]?.id
          || null;
      }

      if (!organizationId) {
        return next(); // Failed - let Better Auth handle error
      }

      // Check for existing active subscription to prevent duplicates
      // Only check if subscriptionId is not provided (new subscription)
      if (!body.subscriptionId) {
        const [org] = await db
          .select({ activeSubscriptionId: schema.organizations.activeSubscriptionId })
          .from(schema.organizations)
          .where(eq(schema.organizations.id, organizationId))
          .limit(1);

        if (org?.activeSubscriptionId) {
          // Check if subscription is still active
          const [subscription] = await db
            .select({ status: schema.subscriptions.status })
            .from(schema.subscriptions)
            .where(eq(schema.subscriptions.id, org.activeSubscriptionId))
            .limit(1);

          if (subscription?.status === 'active' || subscription?.status === 'trialing') {
            // Active subscription exists - include subscriptionId to upgrade instead of creating duplicate
            body.subscriptionId = org.activeSubscriptionId;
          }
        }
      }

      // Update body with org ID
      body.referenceId = organizationId;

      // Create new request with updated body
      const newRequest = new Request(c.req.raw.url, {
        method: 'POST',
        headers: c.req.raw.headers,
        body: JSON.stringify(body),
      });

      // Replace request
      c.req.raw = newRequest;

      // Continue to Better Auth, then sync customer ID after response
      const response = await next();

      // After Better Auth processes the request, sync customer ID if missing
      // This ensures customer ID is saved even if onCustomerCreate didn't run
      if (organizationId) {
        // Run sync in background (don't block response)
        const syncCustomerId = async (): Promise<void> => {
          try {
            const [org] = await db
              .select({ stripeCustomerId: schema.organizations.stripeCustomerId })
              .from(schema.organizations)
              .where(eq(schema.organizations.id, organizationId))
              .limit(1);


            if (org?.stripeCustomerId) {
              return;
            }

            // Find subscription for this organization (get any with customer ID)
            const subscriptions = await db
              .select({
                stripeCustomerId: schema.subscriptions.stripeCustomerId,
              })
              .from(schema.subscriptions)
              .where(eq(schema.subscriptions.referenceId, organizationId))
              .limit(10);

            // Find first subscription with customer ID
            const subscription = subscriptions.find((sub) => sub.stripeCustomerId);

            if (!subscription) {
              return;
            }


            await db
              .update(schema.organizations)
              .set({
                stripeCustomerId: subscription.stripeCustomerId,
              })
              .where(eq(schema.organizations.id, organizationId));
          } catch (error) {
            console.error('Error syncing customer ID:', error);
          }
        };
        void syncCustomerId();
      }

      return response;
    } catch (error) {
      console.error('Error in autoCreateOrgForSubscription:', error);
      return next(); // Continue on error - let Better Auth handle it
    }
  };
};
