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
import { config } from '@/shared/config';
import { uow } from '@/shared/database/uow';
import { EngagementContractSent } from '@/shared/events/definitions';
import { emitLegalEvent } from '@/shared/events/emit-legal-event';
import type { LegalOperationContext } from '@/shared/types/legal-operation-context';

const logger = getLogger(['engagement-contracts', 'send-engagement-contract-operation']);

export const sendEngagementContract = async (
  { id }: { id: string },
  ctx: LegalOperationContext
): Promise<EngagementContractRecord> => {
  assertHumanActor(ctx);
  const contract = await getTenantEngagementContract(id, ctx);

  if (contract.status !== 'draft') {
    throw new HTTPException(409, { message: 'Only draft contracts can be sent' });
  }

  if (!contract.contract_body?.trim()) {
    throw new HTTPException(400, { message: 'Contract body cannot be empty' });
  }

  const [intake, organization] = await Promise.all([
    getTenantIntake(contract.intake_id, contract.organization_id),
    organizationRepository.findById(contract.organization_id),
  ]);

  const metadata = intakeSharedHelpers.parseMetadata(intake.metadata);
  const clientName = metadata?.name ?? 'Client';
  const clientEmail = metadata?.email ?? '';

  const billingSnapshot = contract.proposal_data?.fees ?? { billing_type: 'fixed' };

  const reviewUrl = `${config.app.appUrl}/client/${organization?.slug ?? contract.organization_id}/engagement-contracts/${id}/review`;
  const matterTitle = contract.proposal_data?.client_summary?.matter_summary ?? `Engagement for ${clientName}`;

  const sentContract = await uow.transaction(async () => {
    const sent = await engagementContractsQueries.update(id, {
      status: 'sent',
      sent_at: new Date(),
      billing_snapshot: billingSnapshot,
      updated_at: new Date(),
    });

    await emitLegalEvent(ctx, EngagementContractSent, {
      contract_id: sent.id,
      intake_id: sent.intake_id,
      organization_id: sent.organization_id,
      client_email: clientEmail,
      client_name: clientName,
      matter_title: matterTitle,
      practice_name: organization?.name ?? 'Practice',
      review_url: reviewUrl,
    });

    return sent;
  });

  logger.info('Sent engagement contract', {
    contractId: id,
    intakeId: contract.intake_id,
    organizationId: contract.organization_id,
  });

  return sentContract;
};
