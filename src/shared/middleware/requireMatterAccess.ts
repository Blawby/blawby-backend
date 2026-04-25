import type { MiddlewareHandler } from 'hono';
import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';

import { mattersService } from '@/modules/matters/services/matters.service';
import type { Variables } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

/**
 * Middleware to verify matter access for sub-resource endpoints.
 *
 * Must be used on routes with a matter ID parameter (e.g., `/matters/:id/unbilled`).
 * Automatically checks:
 * 1. Matter exists
 * 2. Matter belongs to user's organization
 * 3. User has CASL ability to access the matter
 *
 * @param matterParamName - Name of the URL parameter containing the matter ID (default: 'id')
 */
export const requireMatterAccess =
  (matterParamName = 'id'): MiddlewareHandler<{ Variables: Variables }> =>
  async (c, next) => {
    const matterId = c.req.param(matterParamName)!;
    const ctx = getServiceContext(c);

    try {
      await mattersService.verifyMatterAccess(matterId, ctx);
    } catch (error) {
      if (error instanceof HTTPException) {
        return c.json({ error: error.message }, error.status);
      }

      if (error instanceof ForbiddenError) {
        return c.json({ error: error.message }, 403);
      }

      throw error;
    }

    return next();
  };
