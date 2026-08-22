import { HTTPException } from 'hono/http-exception';

import type { ServiceContext } from '@/shared/types/service-context';

export interface LegalOperationContext {
  organizationId: string;
  userId: string | null;
}

export const toLegalOperationContext = (ctx: ServiceContext): LegalOperationContext => ({
  organizationId: ctx.organizationId,
  userId: ctx.userId,
});

/**
 * Every Legal Operation owns its own tenant check (KTD19) — it cannot assume a caller-supplied
 * `organizationId` parameter matches the resolved tenant on `ctx`. Existing ServiceContext-based
 * callers already coincide (getServiceContext derives one organizationId), but the facade's
 * LegalOperationContext is a distinct trust boundary and must be checked explicitly.
 */
export const assertLegalOperationTenant = (ctx: LegalOperationContext, organizationId: string): void => {
  if (ctx.organizationId !== organizationId) {
    throw new HTTPException(403, { message: 'Organization does not match the authenticated context' });
  }
};
