/**
 * User Details HTTP Handlers
 *
 * HTTP route handlers for user details API endpoints
 */

import type { Context } from 'hono';
import { getUserDetails, updateUserDetails } from './services/user-details.service';
import { response } from '@/shared/utils/responseUtils';

/**
 * GET /me - Get current user details
 */
export const getDetails = async (c: Context) => {
  try {
    const user = c.get('user')!; // Auth middleware guarantees user is non-null

    const details = await getUserDetails(user.id);

    if (!details) {
      return response.notFound(c, 'Details not found');
    }

    return response.ok(c, { details });
  } catch (error) {
    console.error('Error getting user details:', error);
    return response.internalServerError(c, 'Internal server error');
  }
};

/**
 * PUT /me - Update user details
 */
export const updateDetails = async (c: Context) => {
  try {
    const user = c.get('user')!; // Auth middleware guarantees user is non-null
    const validatedBody = c.get('validatedBody');

    // No conversion needed - dob is already a string
    const updateData = {
      phone: validatedBody.phone,
      dob: validatedBody.dob,
      productUsage: validatedBody.productUsage,
    };

    const updated = await updateUserDetails(user.id, updateData);

    return response.ok(c, updated);
  } catch (error) {
    console.error('Error updating user details:', error);
    return response.internalServerError(c, 'Internal server error');
  }
};
