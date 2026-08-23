import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

import { engagementContractsQueries } from '@/modules/engagement-contracts/database/queries/engagement-contracts.queries';
import {
  assertHumanActor,
  getTenantEngagementContract,
  getTenantIntake,
} from '@/modules/engagement-contracts/operations/engagement-contract-access.helpers';
import type { EngagementContractRecord } from '@/modules/engagement-contracts/types/engagement-contract.types';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { intakeSharedHelpers } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import { uow } from '@/shared/database/uow';
import { EngagementContractDeclined } from '@/shared/events/definitions';
import { emitLegalEvent } from '@/shared/events/emit-legal-event';
import type { LegalOperationContext } from '@/shared/types/legal-operation-context';

const logger = getLogger(['engagement-contracts', 'decline-engagement-contract-operation']);

export const declineEngagementContract = async (
  { id }: { id: string },
  ctx: LegalOperationContext
): Promise<EngagementContractRecord> => {
  assertHumanActor(ctx);
  const contract = await getTenantEngagementContract(id, ctx);

  if (contract.status !== 'sent') {
    throw new HTTPException(409, { message: 'Only sent contracts can be declined' });
  }

  const [intake, organization] = await Promise.all([
    getTenantIntake(contract.intake_id, contract.organization_id),
    organizationRepository.findById(contract.organization_id),
  ]);

  const metadata = intakeSharedHelpers.parseMetadata(intake.metadata);
  const clientName = metadata?.name ?? 'Client';
  const matterTitle = contract.proposal_data?.client_summary?.matter_summary ?? `Engagement: ${clientName}`;

  const declinedContract = await uow.transaction(async () => {
    const declined = await engagementContractsQueries.update(id, {
      status: 'declined',
      declined_at: new Date(),
      updated_at: new Date(),
    });

    await emitLegalEvent(ctx, EngagementContractDeclined, {
      contract_id: declined.id,
      intake_id: declined.intake_id,
      organization_id: declined.organization_id,
      practice_email: organization?.billingEmail ?? '',
      practice_name: organization?.name ?? 'Practice',
      matter_title: matterTitle,
      client_name: clientName,
    });

    return declined;
  });

  logger.info('Declined engagement contract', {
    contractId: id,
    intakeId: contract.intake_id,
    organizationId: contract.organization_id,
  });

  return declinedContract;
};
