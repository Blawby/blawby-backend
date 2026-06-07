import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { engagementContractsQueries } from '@/modules/engagement-contracts/database/queries/engagement-contracts.queries';
import type { SelectEngagementContract } from '@/modules/engagement-contracts/database/schema/engagement-contracts.schema';
import { engagementContractPdfService } from '@/modules/engagement-contracts/services/engagement-contract-pdf.service';
import type {
  CreateEngagementContractRequest,
  EngagementContractRecord,
  ListEngagementContractsQuery,
  UpdateEngagementContractRequest,
} from '@/modules/engagement-contracts/types/engagement-contract.types';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import { matterMilestones } from '@/modules/matters/database/schema/matter-milestones.schema';
import { matterNotes } from '@/modules/matters/database/schema/matter-notes.schema';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { intakeSharedHelpers } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import {
  EngagementContractAccepted,
  EngagementContractCreated,
  EngagementContractDeclined,
  EngagementContractSent,
} from '@/shared/events/definitions/engagement-contracts';
import { db } from '@/shared/database';
import { config } from '@/shared/config';
import type { OffsetPaginatedResponse } from '@/shared/types/pagination';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['engagement-contracts', 'service']);

const assertInOrganization = (contract: SelectEngagementContract, organizationId: string): void => {
  if (contract.organization_id !== organizationId) {
    throw new HTTPException(403, { message: 'Unauthorized' });
  }
};

const loadIntakeForOrg = async (intakeId: string, organizationId: string) => {
  const intake = await practiceClientIntakesRepository.findById(intakeId);
  if (!intake || intake.organization_id !== organizationId) {
    throw new HTTPException(404, { message: 'Intake not found' });
  }
  return intake;
};

const createEngagementContract = async (
  { data }: { data: CreateEngagementContractRequest },
  ctx: ServiceContext
): Promise<EngagementContractRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');

  const intake = await loadIntakeForOrg(data.intake_id, ctx.organizationId);

  if (intake.triage_status !== 'accepted') {
    throw new HTTPException(400, { message: 'Intake must be accepted before creating an engagement contract' });
  }

  const existingContract = await engagementContractsQueries.findAcceptedByIntakeAndOrg(
    data.intake_id,
    ctx.organizationId
  );
  if (existingContract?.status === 'accepted') {
    throw new HTTPException(409, { message: 'An accepted engagement contract already exists for this intake' });
  }

  const metadata = intakeSharedHelpers.parseMetadata(intake.metadata);

  const contract = await db.transaction(async () => {
    let created: SelectEngagementContract;
    try {
      created = await engagementContractsQueries.insert({
        intake_id: data.intake_id,
        organization_id: ctx.organizationId,
        status: 'draft',
        contract_body: data.contract_body ?? null,
        engagement_notes: data.engagement_notes ?? null,
        proposal_data: (data.proposal_data as SelectEngagementContract['proposal_data']) ?? {
          source_snapshot: {
            intake_uuid: intake.id,
            conversation_id: intake.conversation_id ?? '',
            matter_id: '',
            practice_area: metadata?.practice_service_name ?? '',
            urgency: intake.urgency ?? '',
            desired_outcome: intake.desired_outcome ?? '',
            opposing_party: metadata?.opposing_party ?? '',
            court_date: intake.court_date?.toISOString() ?? null,
          },
          draft_meta: {
            generated_at: new Date().toISOString(),
            generated_by: 'staff',
            version: 1,
          },
        },
        created_by: ctx.userId,
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        throw new HTTPException(409, { message: 'An accepted engagement contract already exists for this intake' });
      }
      throw error;
    }

    await ctx.emit(EngagementContractCreated, {
      contract_id: created.id,
      intake_id: created.intake_id,
      organization_id: created.organization_id,
    });

    return created;
  });

  logger.info('Created engagement contract', {
    contractId: contract.id,
    intakeId: contract.intake_id,
    organizationId: ctx.organizationId,
  });

  return contract;
};

const updateEngagementContract = async (
  { id, data }: { id: string; data: UpdateEngagementContractRequest },
  ctx: ServiceContext
): Promise<EngagementContractRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');

  const contract = await engagementContractsQueries.findById(id);
  if (!contract) {
    throw new HTTPException(404, { message: 'Engagement contract not found' });
  }
  assertInOrganization(contract, ctx.organizationId);

  if (contract.status !== 'draft') {
    throw new HTTPException(409, { message: 'Only draft contracts can be updated' });
  }

  const updated = await engagementContractsQueries.update(id, {
    contract_body: data.contract_body,
    engagement_notes: data.engagement_notes,
    proposal_data: data.proposal_data as SelectEngagementContract['proposal_data'],
    updated_at: new Date(),
  });

  logger.info('Updated engagement contract', {
    contractId: id,
    organizationId: ctx.organizationId,
  });

  return updated;
};

const sendEngagementContract = async (
  { id }: { id: string },
  ctx: ServiceContext
): Promise<EngagementContractRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');

  const contract = await engagementContractsQueries.findById(id);
  if (!contract) {
    throw new HTTPException(404, { message: 'Engagement contract not found' });
  }
  assertInOrganization(contract, ctx.organizationId);

  if (contract.status !== 'draft') {
    throw new HTTPException(409, { message: 'Only draft contracts can be sent' });
  }

  if (!contract.contract_body?.trim()) {
    throw new HTTPException(400, { message: 'Contract body cannot be empty' });
  }

  const [intake, organization] = await Promise.all([
    loadIntakeForOrg(contract.intake_id, ctx.organizationId),
    organizationRepository.findById(ctx.organizationId),
  ]);

  const metadata = intakeSharedHelpers.parseMetadata(intake.metadata);
  const clientName = metadata?.name ?? 'Client';
  const clientEmail = metadata?.email ?? '';

  const fees = (contract.proposal_data as { fees?: Record<string, unknown> } | null)?.fees;
  const billingSnapshot = fees ?? {
    billing_type: 'fixed',
  };

  const reviewUrl = `${config.app.appUrl}/client/${organization?.slug ?? ctx.organizationId}/engagement-contracts/${id}/review`;
  const matterTitle =
    (contract.proposal_data as { client_summary?: { matter_summary?: string } } | null)?.client_summary
      ?.matter_summary ?? `Engagement for ${clientName}`;

  const sentContract = await db.transaction(async () => {
    const sent = await engagementContractsQueries.update(id, {
      status: 'sent',
      sent_at: new Date(),
      billing_snapshot: billingSnapshot,
      updated_at: new Date(),
    });

    await ctx.emit(EngagementContractSent, {
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
    organizationId: ctx.organizationId,
  });

  return sentContract;
};

const createMatterFromAcceptedContract = async (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    contract: SelectEngagementContract;
    intake: Awaited<ReturnType<typeof practiceClientIntakesRepository.findById>>;
    userId: string;
    acceptedAt: Date;
  }
): Promise<string> => {
  const { contract, intake, userId, acceptedAt } = params;
  if (!intake) throw new Error('Intake not found');

  const metadata = intakeSharedHelpers.parseMetadata(intake.metadata);

  let clientId: string | undefined;
  if (metadata?.user_id) {
    const clientRecord = await clientsRepository.findByOrgAndUser(intake.organization_id, metadata.user_id);
    if (clientRecord) {
      clientId = clientRecord.id;
    }
  }

  const proposalData = contract.proposal_data as {
    fees?: { billing_type?: string };
    client_summary?: { matter_summary?: string };
  } | null;

  const matter = await mattersQueries.createMatter({
    organization_id: intake.organization_id,
    billing_type: (proposalData?.fees?.billing_type as 'hourly' | 'fixed' | 'contingency' | 'pro_bono') ?? 'fixed',
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
    await tx.insert(matterMilestones).values({
      matter_id: matter.id,
      description: 'Court Date from Intake',
      amount: 0,
      due_date: intake.court_date.toISOString().split('T')[0],
      status: 'pending',
      order: 999,
    });
  }

  if (intake.desired_outcome) {
    await tx.insert(matterNotes).values({
      matter_id: matter.id,
      user_id: userId,
      content: `Desired outcome: ${intake.desired_outcome}`,
    });
  }

  if (typeof intake.case_strength === 'number') {
    await tx.insert(matterNotes).values({
      matter_id: matter.id,
      user_id: userId,
      content: `Case strength score from intake: ${intake.case_strength}`,
    });
  }

  return matter.id;
};

const acceptEngagementContract = async (
  { id, clientIp }: { id: string; clientIp?: string },
  ctx: ServiceContext
): Promise<EngagementContractRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');

  const contract = await engagementContractsQueries.findById(id);
  if (!contract) {
    throw new HTTPException(404, { message: 'Engagement contract not found' });
  }
  assertInOrganization(contract, ctx.organizationId);

  if (contract.status !== 'sent') {
    throw new HTTPException(409, { message: 'Only sent contracts can be accepted' });
  }

  const [intake, organization] = await Promise.all([
    loadIntakeForOrg(contract.intake_id, ctx.organizationId),
    organizationRepository.findById(ctx.organizationId),
  ]);

  const metadata = intakeSharedHelpers.parseMetadata(intake.metadata);
  const clientName = metadata?.name ?? 'Client';
  const clientEmail = metadata?.email ?? '';
  const acceptedAt = new Date();

  const matterTitle =
    (contract.proposal_data as { client_summary?: { matter_summary?: string } } | null)?.client_summary
      ?.matter_summary ?? `Engagement: ${clientName}`;

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

  const acceptedContract = await db.transaction(async (tx) => {
    const matterId = await createMatterFromAcceptedContract(tx, {
      contract,
      intake,
      userId: ctx.userId,
      acceptedAt,
    });

    const accepted = await engagementContractsQueries.update(id, {
      status: 'accepted',
      matter_id: matterId,
      accepted_at: acceptedAt,
      signed_pdf_s3_key: s3Key,
      updated_at: new Date(),
    });

    await ctx.emit(EngagementContractAccepted, {
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
    organizationId: ctx.organizationId,
  });

  return acceptedContract;
};

const declineEngagementContract = async (
  { id }: { id: string },
  ctx: ServiceContext
): Promise<EngagementContractRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');

  const contract = await engagementContractsQueries.findById(id);
  if (!contract) {
    throw new HTTPException(404, { message: 'Engagement contract not found' });
  }
  assertInOrganization(contract, ctx.organizationId);

  if (contract.status !== 'sent') {
    throw new HTTPException(409, { message: 'Only sent contracts can be declined' });
  }

  const [intake, organization] = await Promise.all([
    loadIntakeForOrg(contract.intake_id, ctx.organizationId),
    organizationRepository.findById(ctx.organizationId),
  ]);

  const metadata = intakeSharedHelpers.parseMetadata(intake.metadata);
  const clientName = metadata?.name ?? 'Client';
  const matterTitle =
    (contract.proposal_data as { client_summary?: { matter_summary?: string } } | null)?.client_summary
      ?.matter_summary ?? `Engagement: ${clientName}`;

  const declinedContract = await db.transaction(async () => {
    const declined = await engagementContractsQueries.update(id, {
      status: 'declined',
      declined_at: new Date(),
      updated_at: new Date(),
    });

    await ctx.emit(EngagementContractDeclined, {
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
    organizationId: ctx.organizationId,
  });

  return declinedContract;
};

const listEngagementContracts = async (
  query: ListEngagementContractsQuery,
  ctx: ServiceContext
): Promise<OffsetPaginatedResponse<EngagementContractRecord>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');

  const { page, limit, ...filters } = query;
  const offset = (page - 1) * limit;

  const { data, total } = await engagementContractsQueries.listByOrg(ctx.organizationId, {
    ...filters,
    limit,
    offset,
  });

  return {
    data,
    pagination: { page, limit, total },
  };
};

const getEngagementContract = async (
  { id }: { id: string },
  ctx: ServiceContext
): Promise<EngagementContractRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');

  const contract = await engagementContractsQueries.findById(id);
  if (!contract) {
    throw new HTTPException(404, { message: 'Engagement contract not found' });
  }
  assertInOrganization(contract, ctx.organizationId);

  return contract;
};

export const engagementContractService = {
  createEngagementContract,
  updateEngagementContract,
  sendEngagementContract,
  acceptEngagementContract,
  declineEngagementContract,
  listEngagementContracts,
  getEngagementContract,
};
