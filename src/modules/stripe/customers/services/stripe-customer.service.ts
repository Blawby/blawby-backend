/**
 * Stripe Customer Service
 *
 * Handles Stripe customer creation, updates, and synchronization
 * Publishes events for customer lifecycle management
 */

import { consola } from 'consola';
import { eq } from 'drizzle-orm';
import { customersRepository } from '../database/queries/customers.repository';
import type {
  Preferences,
  InsertPreferences,
} from '@/modules/preferences/schema/preferences.schema';
import type { ProductUsage } from '@/modules/preferences/types/preferences.types';
import { users } from '@/schema/better-auth-schema';
import { preferences } from '@/modules/preferences/schema/preferences.schema';

import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent, publishEventTx } from '@/shared/events/event-publisher';
import { sanitizeError } from '@/shared/utils/logging';
import { stripe } from '@/shared/utils/stripe-client';

export interface CreateStripeCustomerData {
  userId: string;
  email: string;
  name: string;
  phone?: string;
  dob?: string; // Date string in YYYY-MM-DD format
  productUsage?: ProductUsage[];
  source?: 'platform_signup' | 'manual_creation' | 'backfill';
}

export interface UpdateCustomerData {
  // phone and dob are now in users table via Better Auth - use updateUser endpoint
  // This interface kept for backward compatibility but phone/dob updates should go through Better Auth
  phone?: string; // @deprecated - use Better Auth updateUser
  dob?: string; // @deprecated - use Better Auth updateUser
  productUsage?: ProductUsage[];
}

/**
 * Create Stripe customer for user
 */
const createStripeCustomerForUser = async (
  data: CreateStripeCustomerData,
): Promise<Preferences | null> => {
  try {
    // 1. Check if customer already exists
    const existing = await customersRepository.findByUserId(data.userId);
    if (existing) return existing;

    // 2. Create customer on Stripe
    const createParams: Record<string, unknown> = {
      email: data.email,
      name: data.name,
      metadata: {
        user_id: data.userId,
        source: data.source || 'platform_signup',
        dob: data.dob || null,
        product_usage: JSON.stringify(data.productUsage || []),
        created_via: 'blawby_ts',
      },
    };

    if (data.phone) {
      createParams.phone = data.phone;
    }

    const stripeCustomer = await stripe.customers.create(createParams);

    // 3. Wrap database operations in transaction with event publishing
    // Note: Stripe API call is external, so it's outside the transaction
    const savedCustomer = await db.transaction(async (tx) => {
      // Update users table with stripeCustomerId
      await tx
        .update(users)
        .set({ stripeCustomerId: stripeCustomer.id })
        .where(eq(users.id, data.userId));

      // Save preferences (stripeCustomerId is now in users table)
      const customerDetails: InsertPreferences = {
        userId: data.userId,
        // stripeCustomerId is now in users table - don't store here
        // phone and dob are now in users table - don't store here
        // productUsage will be migrated to onboarding JSONB
        productUsage: data.productUsage,
      };

      const [customer] = await tx
        .insert(preferences)
        .values(customerDetails)
        .returning();

      // Publish STRIPE_CUSTOMER_CREATED event within transaction
      await publishEventTx(tx, {
        type: EventType.STRIPE_CUSTOMER_CREATED,
        actorId: data.userId,
        actorType: 'user',
        organizationId: undefined, // Stripe customers are user-level, not org-level
        payload: {
          user_id: data.userId,
          stripe_customer_id: stripeCustomer.id,
          email: data.email,
          name: data.name,
          source: data.source || 'platform_signup',
          created_at: new Date().toISOString(),
        },
      });

      return customer;
    });

    console.info('Stripe customer created successfully', {
      userId: data.userId,
      stripeCustomerId: stripeCustomer.id,
    });

    return savedCustomer;
  } catch (error) {
    consola.error('Failed to create Stripe customer', {
      error: sanitizeError(error),
      userId: data.userId,
    });

    void publishSimpleEvent(
      EventType.STRIPE_CUSTOMER_SYNC_FAILED,
      data.userId,
      undefined,
      {
        user_id: data.userId,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        retry_count: 0,
        failed_at: new Date().toISOString(),
      },
    );

    return null; // Non-blocking: don't throw
  }
};

/**
 * Get or create Stripe customer for user
 */
const getOrCreateStripeCustomer = async (
  userId: string,
  email: string,
  name: string,
): Promise<Preferences> => {
  // Check if customer exists
  const existing = await customersRepository.findByUserId(userId);
  if (existing) {
    return existing;
  }

  // Create new customer
  const newCustomer = await createStripeCustomerForUser({
    userId,
    email,
    name,
    source: 'manual_creation',
  });

  if (!newCustomer) {
    throw new Error('Failed to create Stripe customer');
  }

  return newCustomer;
};

/**
 * Update customer details
 */
const updateCustomerDetails = async (
  userId: string,
  updates: UpdateCustomerData,
): Promise<Preferences> => {
  try {
    // 1. Get existing customer
    const existing = await customersRepository.findByUserId(userId);
    if (!existing) {
      throw new Error('Customer not found');
    }

    // 2. Update on Stripe
    // Note: phone and dob should be read from users table if needed
    const updateParams: Record<string, unknown> = {
      metadata: {
        product_usage: JSON.stringify(updates.productUsage || []),
      },
    };

    // Phone and dob updates should go through Better Auth updateUser endpoint
    // Only update Stripe if explicitly provided (for backward compatibility)
    if (updates.phone) {
      updateParams.phone = updates.phone;
    }
    if (updates.dob) {
      updateParams.metadata = {
        ...updateParams.metadata as Record<string, unknown>,
        dob: updates.dob,
      };
    }

    // Get stripeCustomerId from users table
    const [user] = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user?.stripeCustomerId) {
      throw new Error('Stripe customer ID not found for user');
    }

    await stripe.customers.update(user.stripeCustomerId, updateParams);

    // 3. Update in database within transaction with event publishing
    // Note: Stripe API call is external, so it's outside the transaction
    let updated = existing;
    if (updates.productUsage) {
      updated = await db.transaction(async (tx) => {
        const [customer] = await tx
          .update(preferences)
          .set({ productUsage: updates.productUsage })
          .where(eq(preferences.userId, userId))
          .returning();

        // Publish STRIPE_CUSTOMER_UPDATED event within transaction
        await publishEventTx(tx, {
          type: EventType.STRIPE_CUSTOMER_UPDATED,
          actorId: userId,
          actorType: 'user',
          organizationId: undefined,
          payload: {
            user_id: userId,
            stripe_customer_id: user.stripeCustomerId,
            updated_fields: Object.keys(updates),
            updated_at: new Date().toISOString(),
          },
        });

        return customer || existing;
      });
    } else {
      void publishSimpleEvent(
        EventType.STRIPE_CUSTOMER_UPDATED,
        userId,
        undefined,
        {
          user_id: userId,
          stripe_customer_id: user.stripeCustomerId,
          updated_fields: Object.keys(updates),
          updated_at: new Date().toISOString(),
        },
      );
    }

    console.info('Customer details updated successfully', {
      userId,
      updatedFields: Object.keys(updates),
    });

    return updated;
  } catch (error) {
    console.error('Failed to update customer details', {
      error: sanitizeError(error),
      userId,
    });

    void publishSimpleEvent(
      EventType.STRIPE_CUSTOMER_SYNC_FAILED,
      userId,
      undefined,
      {
        user_id: userId,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        retry_count: 0,
        failed_at: new Date().toISOString(),
      },
    );

    throw error;
  }
};

/**
 * Sync customer with Stripe (if details changed)
 */
const syncStripeCustomer = async (userId: string): Promise<void> => {
  try {
    const customer = await customersRepository.findByUserId(userId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Get stripeCustomerId from users table
    const [user] = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user?.stripeCustomerId) {
      throw new Error('Stripe customer ID not found for user');
    }

    // Get current Stripe customer data
    const stripeCustomer = await stripe.customers.retrieve(user.stripeCustomerId);

    // Check if customer is deleted
    if (stripeCustomer.deleted) {
      throw new Error('Stripe customer has been deleted');
    }

    // Compare and sync if needed
    // Note: phone and dob are now in users table, so we only sync productUsage here
    const needsUpdate
      = stripeCustomer.metadata?.product_usage !== JSON.stringify(customer.productUsage || []);

    if (needsUpdate) {
      await updateCustomerDetails(userId, {
        // phone and dob should be synced via Better Auth, not here
        productUsage: stripeCustomer.metadata?.product_usage
          ? JSON.parse(stripeCustomer.metadata.product_usage)
          : undefined,
      });
    }

    console.info('Customer synced with Stripe', { userId });
  } catch (error) {
    console.error('Failed to sync customer with Stripe', {
      error: sanitizeError(error),
      userId,
    });
    throw error;
  }
};

/**
 * Delete Stripe customer
 */
const deleteStripeCustomer = async (userId: string): Promise<void> => {
  try {
    const customer = await customersRepository.findByUserId(userId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Get stripeCustomerId from users table
    const [user] = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user?.stripeCustomerId) {
      throw new Error('Stripe customer ID not found for user');
    }

    const stripeCustomerId = user.stripeCustomerId;

    // First, start transaction to mark customer as pending deletion and publish event
    await db.transaction(async (tx) => {
      // Mark customer as pending deletion (clear stripeCustomerId)
      await tx
        .update(users)
        .set({ stripeCustomerId: null })
        .where(eq(users.id, userId));

      // Delete preferences
      await tx
        .delete(preferences)
        .where(eq(preferences.userId, userId));

      // Publish STRIPE_CUSTOMER_DELETED event within transaction
      await publishEventTx(tx, {
        type: EventType.STRIPE_CUSTOMER_DELETED,
        actorId: userId,
        actorType: 'user',
        organizationId: undefined,
        payload: {
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          deleted_at: new Date().toISOString(),
        },
      });
    });

    // After successful transaction, delete from Stripe (external API call)
    try {
      await stripe.customers.del(stripeCustomerId);
    } catch (stripeError) {
      // Log error but don't fail - DB transaction already succeeded
      // Record for manual reconciliation if needed
      console.error('Failed to delete Stripe customer after DB transaction', {
        error: sanitizeError(stripeError),
        userId,
        stripeCustomerId,
        note: 'DB transaction succeeded, but Stripe deletion failed. Manual reconciliation may be needed.',
      });
      // Re-throw to allow caller to handle
      throw stripeError;
    }

    console.info('Stripe customer deleted successfully', {
      userId,
      stripeCustomerId: user.stripeCustomerId,
    });
  } catch (error) {
    console.error('Failed to delete Stripe customer', {
      error: sanitizeError(error),
      userId,
    });
    throw error;
  }
};

/**
 * Find customer by Stripe customer ID
 */
const findByStripeCustomerId = async (stripeCustomerId: string): Promise<Preferences | undefined> => {
  return await customersRepository.findByStripeCustomerId(stripeCustomerId);
};

/**
 * Find customer by user ID
 */
const findByUserId = async (userId: string): Promise<Preferences | undefined> => {
  return await customersRepository.findByUserId(userId);
};

// Export service object
export const stripeCustomerService = {
  createStripeCustomerForUser,
  getOrCreateStripeCustomer,
  updateCustomerDetails,
  syncStripeCustomer,
  deleteStripeCustomer,
  findByStripeCustomerId,
  findByUserId,
};
