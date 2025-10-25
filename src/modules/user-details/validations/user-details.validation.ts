/**
 * User Details Validation
 *
 * Validation schemas for user details API endpoints
 */

import { z } from 'zod';
import { PRODUCT_USAGE_OPTIONS } from '../schema/user-details.schema';

export const updateUserDetailsSchema = z.object({
  phone: z.string().min(10).optional(),
  dob: z.coerce.date().optional(),
  productUsage: z.array(z.enum(PRODUCT_USAGE_OPTIONS)).max(5).optional(),
});

export type UpdateUserDetailsRequest = z.infer<typeof updateUserDetailsSchema>;
