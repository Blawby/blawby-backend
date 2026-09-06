import { HTTPException } from 'hono/http-exception';

import { connectedAccountsService } from '@/modules/onboarding/services/connected-accounts.service';
import type { GetAccountResponse } from '@/modules/onboarding/types/onboarding.types';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';

/**
 * Retrieve connected-account status and readiness for an organization (R7). The domain lookup
 * and readiness computation already live in `connectedAccountsService.getAccount` — untouched
 * here, since it takes no `ServiceContext`/CASL dependency and is already auth-independent — this
 * operation only adds the explicit tenant check every Legal Operation must own (KTD19) before
 * delegating, and normalizes "no account" into the same 404 the existing route already returns.
 */
export const getConnectedAccount = async (
  params: { organizationId: string },
  ctx: LegalOperationContext
): Promise<GetAccountResponse> => {
  const { organizationId } = params;
  assertLegalOperationTenant(ctx, organizationId);

  const account = await connectedAccountsService.getAccount(organizationId);
  if (account === null) {
    throw new HTTPException(404, { message: 'No connected Stripe account found for this practice' });
  }

  return account;
};
