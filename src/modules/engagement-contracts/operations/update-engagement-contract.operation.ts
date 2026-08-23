import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

import { engagementContractsQueries } from '@/modules/engagement-contracts/database/queries/engagement-contracts.queries';
import type { SelectEngagementContract } from '@/modules/engagement-contracts/database/schema/engagement-contracts.schema';
import {
  assertHumanActor,
  getTenantEngagementContract,
} from '@/modules/engagement-contracts/operations/engagement-contract-access.helpers';
import type {
  EngagementContractRecord,
  UpdateEngagementContractRequest,
} from '@/modules/engagement-contracts/types/engagement-contract.types';
import type { LegalOperationContext } from '@/shared/types/legal-operation-context';

const logger = getLogger(['engagement-contracts', 'update-engagement-contract-operation']);

export const updateEngagementContract = async (
  { id, data }: { id: string; data: UpdateEngagementContractRequest },
  ctx: LegalOperationContext
): Promise<EngagementContractRecord> => {
  assertHumanActor(ctx);
  const contract = await getTenantEngagementContract(id, ctx);

  if (contract.status !== 'draft') {
    throw new HTTPException(409, { message: 'Only draft contracts can be updated' });
  }

  const updated = await engagementContractsQueries.update(id, {
    contract_body: data.contract_body,
    engagement_notes: data.engagement_notes,
    // SAFETY: `data.proposal_data` is validated by `proposalDataSchema`, whose optional numeric
    // Fields infer as `T | null | undefined` while `ProposalData` declares them `T | null` —
    // Zod's `.optional()` never actually produces `undefined` for a field the caller supplied a
    // Value for, and the field is omitted entirely (not present as `undefined`) otherwise.
    proposal_data: data.proposal_data as SelectEngagementContract['proposal_data'],
    updated_at: new Date(),
  });

  logger.info('Updated engagement contract', {
    contractId: id,
    organizationId: contract.organization_id,
  });

  return updated;
};
