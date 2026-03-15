import type { MiddlewareHandler } from 'hono';

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
    const accessResult = await mattersService.verifyMatterAccess(matterId, ctx);

    if (!accessResult.success) {
      const { error } = accessResult;
      // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
      return c.json({ error: error.message }, error.status as 403 | 404);
    }

    return next();
  };
