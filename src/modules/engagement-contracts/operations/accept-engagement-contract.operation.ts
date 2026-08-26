import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

import { engagementContractsQueries } from '@/modules/engagement-contracts/database/queries/engagement-contracts.queries';
import type { SelectEngagementContract } from '@/modules/engagement-contracts/database/schema/engagement-contracts.schema';
import {
  assertHumanActor,
  getTenantEngagementContract,
  getTenantEngagementContractForUpdate,
  getTenantIntake,
} from '@/modules/engagement-contracts/operations/engagement-contract-access.helpers';
import { engagementContractPdfService } from '@/modules/engagement-contracts/services/engagement-contract-pdf.service';
import type { EngagementContractRecord } from '@/modules/engagement-contracts/types/engagement-contract.types';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import type { InsertMatter } from '@/modules/matters/database/schema/matters.schema';
import { matterMilestones } from '@/modules/matters/database/schema/matter-milestones.schema';
import { matterNotes } from '@/modules/matters/database/schema/matter-notes.schema';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { intakeSharedHelpers } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { getActiveTx, uow } from '@/shared/database/uow';
import { EngagementContractAccepted } from '@/shared/events/definitions';
import { emitLegalEvent } from '@/shared/events/emit-legal-event';
import type { LegalOperationContext } from '@/shared/types/legal-operation-context';

const logger = getLogger(['engagement-contracts', 'accept-engagement-contract-operation']);

const MATTER_BILLING_TYPES = new Set(['hourly', 'fixed', 'contingency', 'pro_bono']);

const isMatterBillingType = (value: unknown): value is InsertMatter['billing_type'] =>
  typeof value === 'string' && MATTER_BILLING_TYPES.has(value);

const createMatterFromAcceptedContract = async (params: {
  contract: SelectEngagementContract;
  intake: SelectPracticeClientIntake;
  userId: string;
  acceptedAt: Date;
}): Promise<string> => {
  const { contract, intake, userId, acceptedAt } = params;
  const metadata = intakeSharedHelpers.parseMetadata(intake.metadata);

  const clientRecord = metadata?.user_id
    ? await clientsRepository.findByOrgAndUser(intake.organization_id, metadata.user_id)
    : undefined;
  const clientId = clientRecord?.id;

  const proposalData = contract.proposal_data;
  const billingType = isMatterBillingType(proposalData?.fees?.billing_type) ? proposalData.fees.billing_type : 'fixed';

  const matter = await mattersQueries.createMatter({
    organization_id: intake.organization_id,
    billing_type: billingType,
    client_id: clientId,
    title: proposalData?.client_summary?.matter_summary ?? `Engagement: ${metadata?.name ?? 'Client'}`,
    description: intake.desired_outcome ?? undefined,
    status: 'active',
    urgency: intake.urgency ?? 'routine',
    intake_uuid: intake.id,
    conversation_id: intake.conversation_id ?? undefined,
    on_behalf_of: metadata?.on_behalf_of,
    opposing_party: metadata?.opposing_party,
    opposing_counsel: metadata?.opposing_counsel,
    open_date: acceptedAt,
  });

  if (intake.court_date) {
    await getActiveTx()
      .insert(matterMilestones)
      .values({
        matter_id: matter.id,
        description: 'Court Date from Intake',
        amount: 0,
        due_date: intake.court_date.toISOString().split('T')[0],
        status: 'pending',
        order: 999,
      });
  }

  if (intake.desired_outcome) {
    await getActiveTx()
      .insert(matterNotes)
      .values({
        matter_id: matter.id,
        user_id: userId,
        content: `Desired outcome: ${intake.desired_outcome}`,
      });
  }

  if (typeof intake.case_strength === 'number') {
    await getActiveTx()
      .insert(matterNotes)
      .values({
        matter_id: matter.id,
        user_id: userId,
        content: `Case strength score from intake: ${intake.case_strength}`,
      });
  }

  return matter.id;
};

/**
 * Accept a sent engagement contract. PDF rendering/upload runs before any database transaction
 * (deterministic R2 key, may run twice for a concurrent retry — that is acceptable and expected).
 * The matter/milestone/note/contract/event writes happen inside one transaction that first locks
 * the contract row and re-checks it is still `sent`; a concurrent or retried caller that loses the
 * race sees the standard "only sent contracts can be accepted" conflict instead of creating a
 * second matter (KTD21/R24).
 */
export const acceptEngagementContract = async (
  { id, clientIp }: { id: string; clientIp?: string },
  ctx: LegalOperationContext
): Promise<EngagementContractRecord> => {
  const userId = assertHumanActor(ctx);
  const contract = await getTenantEngagementContract(id, ctx);

  if (contract.status !== 'sent') {
    throw new HTTPException(409, { message: 'Only sent contracts can be accepted' });
  }

  const [intake, organization] = await Promise.all([
    getTenantIntake(contract.intake_id, contract.organization_id),
    organizationRepository.findById(contract.organization_id),
  ]);

  const metadata = intakeSharedHelpers.parseMetadata(intake.metadata);
  const clientName = metadata?.name ?? 'Client';
  const clientEmail = metadata?.email ?? '';
  const acceptedAt = new Date();
  const matterTitle = contract.proposal_data?.client_summary?.matter_summary ?? `Engagement: ${clientName}`;

  const pdfBuffer = await engagementContractPdfService.generatePdfBuffer(contract, {
    practiceName: organization?.name ?? 'Practice',
    clientName,
    matterTitle,
    acceptedAt,
    clientIp,
  });

  const s3Key = await engagementContractPdfService.uploadPdfToR2({
    organizationId: contract.organization_id,
    contractId: contract.id,
    pdfBuffer,
  });

  const acceptedContract = await uow.transaction(async () => {
    const lockedContract = await getTenantEngagementContractForUpdate(id, ctx);
    if (lockedContract.status !== 'sent') {
      throw new HTTPException(409, { message: 'Only sent contracts can be accepted' });
    }

    const matterId = await createMatterFromAcceptedContract({
      contract: lockedContract,
      intake,
      userId,
      acceptedAt,
    });

    const accepted = await engagementContractsQueries.update(id, {
      status: 'accepted',
      matter_id: matterId,
      accepted_at: acceptedAt,
      signed_pdf_s3_key: s3Key,
      updated_at: new Date(),
    });

    await emitLegalEvent(ctx, EngagementContractAccepted, {
      contract_id: accepted.id,
      matter_id: matterId,
      organization_id: accepted.organization_id,
      practice_email: organization?.billingEmail ?? '',
      practice_name: organization?.name ?? 'Practice',
      matter_title: matterTitle,
      client_name: clientName,
      client_email: clientEmail,
      signed_pdf_s3_key: s3Key,
    });

    return accepted;
  });

  logger.info('Accepted engagement contract', {
    contractId: id,
    matterId: acceptedContract.matter_id,
    intakeId: contract.intake_id,
    organizationId: contract.organization_id,
  });

  return acceptedContract;
};
