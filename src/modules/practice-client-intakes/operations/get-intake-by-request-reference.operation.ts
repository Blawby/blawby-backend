import { HTTPException } from 'hono/http-exception';

import { findRecoverableIntakeByRequestKey } from '@/modules/practice-client-intakes/operations/create-intake.operation';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import type { CreateIntakeResponse } from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';

/**
 * Recover a practice client intake by its KrabiClaw request reference, without creating one
 * (R8). Backs the read-only `GET /intakes/requests/{request_id}` facade route: unlike
 * `createIntake`, which creates a fresh intake on a miss, this operation returns a `404` when no
 * intake has been recorded under `(organizationId, requestKey)` for this organization. The
 * lookup is tenant-checked (KTD19) and org-scoped, so a request key that produced an intake for
 * a different organization can never be recovered here (R20) — it returns the same recoverable
 * create result (including payment-link state) that `createIntake` itself would return on a
 * same-key retry.
 *
 * `allowPaymentLinkCreation` (facade callers only): same gate as `createIntake`'s — this route is
 * ALSO scoped to the `intake-without-payment` rollout group alone, so a previously created intake
 * that carries a real Stripe payment link (made while `intake-payment` was on) must not still be
 * handed back through this route once that rollout group is off again.
 */
export const getIntakeByRequestReference = async (
  params: { organizationId: string; requestKey: string; allowPaymentLinkCreation?: boolean },
  ctx: LegalOperationContext
): Promise<CreateIntakeResponse> => {
  const { organizationId, requestKey, allowPaymentLinkCreation } = params;
  assertLegalOperationTenant(ctx, organizationId);

  const organization = await organizationRepository.findById(organizationId);
  if (!organization) {
    throw new HTTPException(404, { message: `Organization not found for '${organizationId}'` });
  }

  const recovered = await findRecoverableIntakeByRequestKey(organizationId, requestKey, organization);
  if (!recovered) {
    throw new HTTPException(404, { message: 'No intake found for the given request reference' });
  }

  if (recovered.payment_link_url && allowPaymentLinkCreation === false) {
    throw new HTTPException(403, {
      message: 'Payment-enabled intake creation is not yet available for this caller',
    });
  }

  return recovered;
};
