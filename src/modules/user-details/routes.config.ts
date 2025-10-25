/**
 * User Details Routes Configuration
 *
 * Route definitions for user details API endpoints
 */

import { RouteMiddlewareConfig } from '@/shared/router/module-router';

export const userDetailsRoutes: RouteMiddlewareConfig = {
  '*': [
    'requireAuth',
  ],
};
