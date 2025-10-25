/**
 * User Details HTTP App
 *
 * Hono app for user details API endpoints
 */

import { Hono } from 'hono';
import { getDetails, updateDetails } from '@/modules/user-details/handlers';
import { updateUserDetailsSchema } from '@/modules/user-details/validations/user-details.validation';
import { validateJson } from '@/shared/middleware/validation';
import type { AppContext } from '@/shared/types/hono';

const app = new Hono<AppContext>();

// GET /me - Get current user details
app.get('/me', getDetails);

// PUT /me - Update user details
app.put(
  '/me',
  validateJson(
    updateUserDetailsSchema,
    'Invalid details data',
  ),
  updateDetails,
);

export default app;
