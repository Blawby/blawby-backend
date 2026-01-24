/**
 * Stripe Customer Service
 *
 * Handles Stripe customer creation, updates, and synchronization
 * Publishes events for customer lifecycle management
 */

import { getLogger } from '@logtape/logtape';
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
import { stripe } from '@/shared/utils/stripe-client';
import type { Result } from '@/shared/types/result';
import { ok, internalError, notFound } from '@/shared/utils/result';

const logger = getLogger(['stripe', 'customer-service']);

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
  phone?: string; // @deprecated - use Better Auth updateUser
  dob?: string; // @deprecated - use Better Auth updateUser
  productUsage?: ProductUsage[];
}

/**
 * Stripe Customer Service
 */
export const stripeCustomerService = {
  /**
   * Create Stripe customer for user
   */
  async createStripeCustomerForUser(
    data: CreateStripeCustomerData,
  ): Promise<Result<Preferences>> {
    try {
      // 1. Check if customer already exists
      const existing = await customersRepository.findByUserId(data.userId);
      if (existing) return ok(existing);

      // 2. Create customer on Stripe
      const createParams: any = {
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
      const savedCustomer = await db.transaction(async (tx) => {
        // Update users table with stripeCustomerId
        await tx
          .update(users)
          .set({ stripeCustomerId: stripeCustomer.id })
          .where(eq(users.id, data.userId));

        // Save preferences
        const customerDetails: InsertPreferences = {
          user_id: data.userId,
          product_usage: data.productUsage,
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
          organizationId: undefined,
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

      logger.info('Stripe customer created successfully for user {userId}: {stripeCustomerId}', {
        userId: data.userId,
        stripeCustomerId: stripeCustomer.id,
      });

      return ok(savedCustomer);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create Stripe customer for user {userId}: {error}', {
        error: errorMessage,
        userId: data.userId,
      });

      void publishSimpleEvent(
        EventType.STRIPE_CUSTOMER_SYNC_FAILED,
        data.userId,
        undefined,
        {
          user_id: data.userId,
          error_message: errorMessage,
          retry_count: 0,
          failed_at: new Date().toISOString(),
        },
      );

      return internalError(errorMessage);
    }
  },

  /**
   * Get or create Stripe customer for user
   */
  async getOrCreateStripeCustomer(
    userId: string,
    email: string,
    name: string,
  ): Promise<Result<Preferences>> {
    const existing = await customersRepository.findByUserId(userId);
    if (existing) {
      return ok(existing);
    }

    return this.createStripeCustomerForUser({
      userId,
      email,
      name,
      source: 'manual_creation',
    });
  },

  /**
   * Update customer details
   */
  async updateCustomerDetails(
    userId: string,
    updates: UpdateCustomerData,
  ): Promise<Result<Preferences>> {
    try {
      const existing = await customersRepository.findByUserId(userId);
      if (!existing) {
        return notFound('Customer preferences not found');
      }

      const [userData] = await db
        .select({ stripeCustomerId: users.stripeCustomerId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!userData?.stripeCustomerId) {
        return internalError('Stripe customer ID not found for user');
      }

      const updateParams: any = {
        metadata: {
          product_usage: JSON.stringify(updates.productUsage || []),
        },
      };

      if (updates.phone) {
        updateParams.phone = updates.phone;
      }
      if (updates.dob) {
        updateParams.metadata.dob = updates.dob;
      }

      await stripe.customers.update(userData.stripeCustomerId, updateParams);

      let updated = existing;
      if (updates.productUsage) {
        updated = await db.transaction(async (tx) => {
          const [customer] = await tx
            .update(preferences)
            .set({ product_usage: updates.productUsage })
            .where(eq(preferences.user_id, userId))
            .returning();

          await publishEventTx(tx, {
            type: EventType.STRIPE_CUSTOMER_UPDATED,
            actorId: userId,
            actorType: 'user',
            organizationId: undefined,
            payload: {
              user_id: userId,
              stripe_customer_id: userData.stripeCustomerId,
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
            stripe_customer_id: userData.stripeCustomerId,
            updated_fields: Object.keys(updates),
            updated_at: new Date().toISOString(),
          },
        );
      }

      logger.info('Customer details updated successfully for user {userId}', {
        userId,
        updatedFields: Object.keys(updates),
      });

      return ok(updated);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update customer details for user {userId}: {error}', {
        error: errorMessage,
        userId,
      });

      void publishSimpleEvent(
        EventType.STRIPE_CUSTOMER_SYNC_FAILED,
        userId,
        undefined,
        {
          user_id: userId,
          error_message: errorMessage,
          retry_count: 0,
          failed_at: new Date().toISOString(),
        },
      );

      return internalError(errorMessage);
    }
  },

  /**
   * Sync customer with Stripe
   */
  async syncStripeCustomer(userId: string): Promise<Result<void>> {
    try {
      const customer = await customersRepository.findByUserId(userId);
      if (!customer) {
        return notFound('Customer not found');
      }

      const [userData] = await db
        .select({ stripeCustomerId: users.stripeCustomerId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!userData?.stripeCustomerId) {
        return internalError('Stripe customer ID not found for user');
      }

      const stripeCustomer = await stripe.customers.retrieve(userData.stripeCustomerId);

      if (stripeCustomer.deleted) {
        return internalError('Stripe customer has been deleted');
      }

      const needsUpdate =
        stripeCustomer.metadata?.product_usage !== JSON.stringify(customer.product_usage || []);

      if (needsUpdate) {
        await this.updateCustomerDetails(userId, {
          productUsage: stripeCustomer.metadata?.product_usage
            ? JSON.parse(stripeCustomer.metadata.product_usage)
            : undefined,
        });
      }

      logger.info('Customer synced with Stripe for user {userId}', { userId });
      return ok(undefined);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to sync customer with Stripe for user {userId}: {error}', {
        error: errorMessage,
        userId,
      });
      return internalError(errorMessage);
    }
  },

  /**
   * Delete Stripe customer
   */
  async deleteStripeCustomer(userId: string): Promise<Result<void>> {
    try {
      const customer = await customersRepository.findByUserId(userId);
      if (!customer) {
        return notFound('Customer not found');
      }

      const [userData] = await db
        .select({ stripeCustomerId: users.stripeCustomerId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!userData?.stripeCustomerId) {
        return internalError('Stripe customer ID not found for user');
      }

      const stripeCustomerId = userData.stripeCustomerId;

      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ stripeCustomerId: null })
          .where(eq(users.id, userId));

        await tx.delete(preferences).where(eq(preferences.user_id, userId));

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

      try {
        await stripe.customers.del(stripeCustomerId);
      } catch (stripeError) {
        logger.error(
          'Failed to delete Stripe customer after DB transaction for user {userId}: {error}',
          {
            error: stripeError instanceof Error ? stripeError.message : 'Unknown',
            userId,
            stripeCustomerId,
          },
        );
      }

      logger.info('Stripe customer deleted successfully for user {userId}', { userId });
      return ok(undefined);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to delete Stripe customer for user {userId}: {error}', {
        error: errorMessage,
        userId,
      });
      return internalError(errorMessage);
    }
  },

  /**
   * Find customer by Stripe customer ID
   */
  async findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<Result<Preferences | undefined>> {
    try {
      const customer = await customersRepository.findByStripeCustomerId(stripeCustomerId);
      return ok(customer);
    } catch (error) {
      return internalError(error instanceof Error ? error.message : 'Unknown error');
    }
  },

  /**
   * Find customer by user ID
   */
  async findByUserId(userId: string): Promise<Result<Preferences | undefined>> {
    try {
      const customer = await customersRepository.findByUserId(userId);
      return ok(customer);
    } catch (error) {
      return internalError(error instanceof Error ? error.message : 'Unknown error');
    }
  },
};

export default stripeCustomerService;
