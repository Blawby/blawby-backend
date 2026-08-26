import {
  assertHumanActor,
  getTenantEngagementContract,
} from '@/modules/engagement-contracts/operations/engagement-contract-access.helpers';
import type { EngagementContractRecord } from '@/modules/engagement-contracts/types/engagement-contract.types';
import type { LegalOperationContext } from '@/shared/types/legal-operation-context';

export const getEngagementContract = async (
  id: string,
  ctx: LegalOperationContext
): Promise<EngagementContractRecord> => {
  assertHumanActor(ctx);
  return getTenantEngagementContract(id, ctx);
};
