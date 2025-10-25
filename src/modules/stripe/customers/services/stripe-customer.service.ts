/**
 * Stripe Customer Service
 *
 * Handles Stripe customer creation, updates, and synchronization
 * Publishes events for customer lifecycle management
 */

import { consola } from 'consola';
import { customersRepository } from '../database/queries/customers.repository';
import type {
  UserDetails,
  InsertUserDetails,
  ProductUsage,
} from '@/modules/user-details/schema/user-details.schema';

import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
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
  phone?: string;
  dob?: string; // Date string in YYYY-MM-DD format
  productUsage?: ProductUsage[];
}

/**
 * Create Stripe customer for user
 */
const createStripeCustomerForUser = async (
  data: CreateStripeCustomerData,
): Promise<UserDetails | null> => {
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

    // 3. Save to database
    const customerDetails: InsertUserDetails = {
      userId: data.userId,
      stripeCustomerId: stripeCustomer.id,
      phone: data.phone,
      dob: data.dob,
      productUsage: data.productUsage,
    };

    const savedCustomer = await customersRepository.create(customerDetails);

    // 4. Publish STRIPE_CUSTOMER_CREATED event
    void publishSimpleEvent(
      EventType.STRIPE_CUSTOMER_CREATED,
      'user',
      data.userId,
      {
        user_id: data.userId,
        stripe_customer_id: stripeCustomer.id,
        email: data.email,
        name: data.name,
        source: data.source || 'platform_signup',
        created_at: new Date().toISOString(),
      },
    );

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

    // Publish failure event for monitoring
    void publishSimpleEvent(
      EventType.STRIPE_CUSTOMER_SYNC_FAILED,
      'user',
      data.userId,
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
): Promise<UserDetails> => {
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
): Promise<UserDetails> => {
  try {
    // 1. Get existing customer
    const existing = await customersRepository.findByUserId(userId);
    if (!existing) {
      throw new Error('Customer not found');
    }

    // 2. Update on Stripe
    const updateParams: Record<string, unknown> = {
      metadata: {
        dob: updates.dob || null,
        product_usage: JSON.stringify(updates.productUsage || []),
      },
    };

    if (updates.phone) {
      updateParams.phone = updates.phone;
    }

    await stripe.customers.update(existing.stripeCustomerId, updateParams);

    // 3. Update in database
    const updated = await customersRepository.updateByUserId(userId, updates);

    // 4. Publish STRIPE_CUSTOMER_UPDATED event
    void publishSimpleEvent(
      EventType.STRIPE_CUSTOMER_UPDATED,
      'user',
      userId,
      {
        user_id: userId,
        stripe_customer_id: existing.stripeCustomerId,
        updated_fields: Object.keys(updates),
        updated_at: new Date().toISOString(),
      },
    );

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

    // Publish failure event
    void publishSimpleEvent(
      EventType.STRIPE_CUSTOMER_SYNC_FAILED,
      'user',
      userId,
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

    // Get current Stripe customer data
    const stripeCustomer = await stripe.customers.retrieve(customer.stripeCustomerId);

    // Check if customer is deleted
    if (stripeCustomer.deleted) {
      throw new Error('Stripe customer has been deleted');
    }

    // Compare and sync if needed
    const needsUpdate
      = stripeCustomer.phone !== customer.phone
      || stripeCustomer.metadata?.dob !== customer.dob?.toString()
      || stripeCustomer.metadata?.product_usage !== JSON.stringify(customer.productUsage || []);

    if (needsUpdate) {
      await updateCustomerDetails(userId, {
        phone: stripeCustomer.phone || undefined,
        dob: stripeCustomer.metadata?.dob.toString(),
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

    // Delete from Stripe
    await stripe.customers.del(customer.stripeCustomerId);

    // Delete from database
    await customersRepository.deleteByUserId(userId);

    // Publish STRIPE_CUSTOMER_DELETED event
    await publishSimpleEvent(
      EventType.STRIPE_CUSTOMER_DELETED,
      'user',
      userId,
      {
        user_id: userId,
        stripe_customer_id: customer.stripeCustomerId,
        deleted_at: new Date().toISOString(),
      },
    );

    console.info('Stripe customer deleted successfully', {
      userId,
      stripeCustomerId: customer.stripeCustomerId,
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
const findByStripeCustomerId = async (stripeCustomerId: string): Promise<UserDetails | undefined> => {
  return await customersRepository.findByStripeCustomerId(stripeCustomerId);
};

/**
 * Find customer by user ID
 */
const findByUserId = async (userId: string): Promise<UserDetails | undefined> => {
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
