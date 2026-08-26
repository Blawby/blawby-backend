import { HTTPException } from 'hono/http-exception';

import { engagementContractsQueries } from '@/modules/engagement-contracts/database/queries/engagement-contracts.queries';
import type { SelectEngagementContract } from '@/modules/engagement-contracts/database/schema/engagement-contracts.schema';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';

/** Every engagement-contract use case is staff/human-only — no anonymous or client-actor path exists for this lifecycle. */
export const assertHumanActor = (ctx: LegalOperationContext): string => {
  if (!ctx.userId) {
    throw new HTTPException(403, { message: 'Engagement contracts require a human actor' });
  }
  return ctx.userId;
};

/** Load a contract by id and assert it belongs to the context organization; 404 if missing. */
export const getTenantEngagementContract = async (
  id: string,
  ctx: LegalOperationContext
): Promise<SelectEngagementContract> => {
  const contract = await engagementContractsQueries.findById(id);
  if (!contract) {
    throw new HTTPException(404, { message: 'Engagement contract not found' });
  }
  assertLegalOperationTenant(ctx, contract.organization_id);
  return contract;
};

/** Row-locked variant for use only inside an active UoW transaction. */
export const getTenantEngagementContractForUpdate = async (
  id: string,
  ctx: LegalOperationContext
): Promise<SelectEngagementContract> => {
  const contract = await engagementContractsQueries.findByIdForUpdate(id);
  if (!contract) {
    throw new HTTPException(404, { message: 'Engagement contract not found' });
  }
  assertLegalOperationTenant(ctx, contract.organization_id);
  return contract;
};

/** Load an intake and assert it belongs to the given organization; 404 if missing or foreign. */
export const getTenantIntake = async (
  intakeId: string,
  organizationId: string
): Promise<SelectPracticeClientIntake> => {
  const intake = await practiceClientIntakesRepository.findById(intakeId);
  if (!intake || intake.organization_id !== organizationId) {
    throw new HTTPException(404, { message: 'Intake not found' });
  }
  return intake;
};
