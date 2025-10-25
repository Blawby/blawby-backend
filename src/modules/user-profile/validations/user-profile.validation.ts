/**
 * User Profile Validation
 *
 * Validation schemas for user profile API endpoints
 */

import { z } from 'zod';
import { PRODUCT_USAGE_OPTIONS } from '@/modules/user-details/schema/user-details.schema';

export const updateUserProfileSchema = z.object({
  phone: z.string().min(10).optional(),
  dob: z.string().date().optional(),
  productUsage: z.array(z.enum(PRODUCT_USAGE_OPTIONS)).max(5).optional(),
});

export type UpdateUserProfileRequest = z.infer<typeof updateUserProfileSchema>;
