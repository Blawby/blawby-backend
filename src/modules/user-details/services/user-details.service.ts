/**
 * User Details Service
 *
 * Service layer for user details operations
 * Reuses existing Stripe customer service for data operations
 */

import type { UserDetails, ProductUsage } from '../schema/user-details.schema';
import { stripeCustomerService } from '@/modules/stripe/customers/services/stripe-customer.service';
import type { UpdateCustomerData } from '@/modules/stripe/customers/services/stripe-customer.service';

export interface UpdateProfileData {
  phone?: string;
  dob?: string; // Date string in YYYY-MM-DD format
  productUsage?: string[];
}

/**
 * Get user details by user ID
 */
export const getUserDetails = async (userId: string): Promise<UserDetails | undefined> => {
  return await stripeCustomerService.findByUserId(userId);
};

/**
 * Update user details
 * This will update both the user_details table and sync with Stripe
 */
export const updateUserDetails = async (
  userId: string,
  data: UpdateProfileData,
): Promise<UserDetails> => {
  const updateData: UpdateCustomerData = {
    phone: data.phone,
    dob: data.dob,
    productUsage: data.productUsage as ProductUsage[], // Type assertion for compatibility
  };

  return await stripeCustomerService.updateCustomerDetails(userId, updateData);
};
