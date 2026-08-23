import { engagementContractsQueries } from '@/modules/engagement-contracts/database/queries/engagement-contracts.queries';
import { assertHumanActor } from '@/modules/engagement-contracts/operations/engagement-contract-access.helpers';
import type {
  EngagementContractRecord,
  ListEngagementContractsQuery,
} from '@/modules/engagement-contracts/types/engagement-contract.types';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';
import type { OffsetPaginatedResponse } from '@/shared/types/pagination';

export const listEngagementContracts = async (
  { organizationId, query }: { organizationId: string; query: ListEngagementContractsQuery },
  ctx: LegalOperationContext
): Promise<OffsetPaginatedResponse<EngagementContractRecord>> => {
  assertLegalOperationTenant(ctx, organizationId);
  assertHumanActor(ctx);

  const { page, limit, ...filters } = query;
  const offset = (page - 1) * limit;

  const { data, total } = await engagementContractsQueries.listByOrg(organizationId, {
    ...filters,
    limit,
    offset,
  });

  return {
    data,
    pagination: { page, limit, total },
  };
};
