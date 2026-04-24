import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { and, eq } from 'drizzle-orm';
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
import { matters } from '@/modules/matters/database/schema/matters.schema';
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

const createEngagementContract = async (
  { data }: { data: CreateEngagementContractRequest },
  ctx: ServiceContext
): Promise<EngagementContractRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');

  const matter = await db.query.matters.findFirst({
    where: (table, { and: andExpr, eq: eqExpr }) =>
      andExpr(eqExpr(table.id, data.matter_id), eqExpr(table.organization_id, ctx.organizationId)),
  });

  if (!matter) {
    throw new HTTPException(404, { message: 'Matter not found' });
  }

  if (matter.status === 'engagement_accepted' || matter.status === 'active') {
    throw new HTTPException(409, {
      message: 'Cannot create engagement contract for a matter that is already engaged or active',
    });
  }

  const existingContract = await engagementContractsQueries.findByMatterAndOrg(data.matter_id, ctx.organizationId);
  if (existingContract?.status === 'accepted') {
    throw new HTTPException(409, { message: 'An accepted engagement contract already exists for this matter' });
  }

  const contract = await db.transaction(async (tx) => {
    let created: SelectEngagementContract;
    try {
      created = await engagementContractsQueries.insert(
        {
          matter_id: data.matter_id,
          organization_id: ctx.organizationId,
          status: 'draft',
          contract_body: data.contract_body ?? null,
          engagement_notes: data.engagement_notes ?? null,
          proposal_data: (data.proposal_data as SelectEngagementContract['proposal_data']) ?? null,
          created_by: ctx.userId,
        },
        tx
      );
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        throw new HTTPException(409, { message: 'An accepted engagement contract already exists for this matter' });
      }
      throw error;
    }

    await tx
      .update(matters)
      .set({
        status: 'engagement_draft',
        updated_at: new Date(),
      })
      .where(and(eq(matters.id, data.matter_id), eq(matters.organization_id, ctx.organizationId)));

    await ctx.emit(
      EngagementContractCreated,
      {
        contract_id: created.id,
        matter_id: created.matter_id,
        organization_id: created.organization_id,
      },
      tx
    );

    return created;
  });

  logger.info('Created engagement contract', {
    contractId: contract.id,
    matterId: contract.matter_id,
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

  const matter = await db.query.matters.findFirst({
    where: (table, { and: andExpr, eq: eqExpr }) =>
      andExpr(eqExpr(table.id, contract.matter_id), eqExpr(table.organization_id, ctx.organizationId)),
  });

  if (!matter) {
    throw new HTTPException(404, { message: 'Associated matter not found' });
  }

  const clientId = matter.client_id;
  const [client, organization] = await Promise.all([
    clientId !== null
      ? db.query.clients.findFirst({
          where: (table, { and: andExpr, eq: eqExpr }) =>
            andExpr(eqExpr(table.id, clientId), eqExpr(table.organization_id, ctx.organizationId)),
        })
      : Promise.resolve(null),
    db.query.organizations.findFirst({
      where: (table, { eq: eqExpr }) => eqExpr(table.id, ctx.organizationId),
    }),
  ]);

  const billingSnapshot = {
    billing_type: matter.billing_type,
    total_fixed_price: matter.total_fixed_price,
    contingency_percentage: matter.contingency_percentage,
    admin_hourly_rate: matter.admin_hourly_rate,
    attorney_hourly_rate: matter.attorney_hourly_rate,
    payment_frequency: matter.payment_frequency,
  };

  const reviewUrl = `${config.app.appUrl}/client/${organization?.slug ?? ctx.organizationId}/engagement-contracts/${id}/review`;

  const sentContract = await db.transaction(async (tx) => {
    const sent = await engagementContractsQueries.update(
      id,
      {
        status: 'sent',
        sent_at: new Date(),
        billing_snapshot: billingSnapshot,
        updated_at: new Date(),
      },
      tx
    );

    await tx
      .update(matters)
      .set({
        status: 'engagement_sent',
        updated_at: new Date(),
      })
      .where(and(eq(matters.id, contract.matter_id), eq(matters.organization_id, ctx.organizationId)));

    await ctx.emit(
      EngagementContractSent,
      {
        contract_id: sent.id,
        matter_id: sent.matter_id,
        organization_id: sent.organization_id,
        client_email: client?.email ?? '',
        client_name: client?.name ?? matter.on_behalf_of ?? 'Client',
        matter_title: matter.title,
        practice_name: organization?.name ?? 'Practice',
        review_url: reviewUrl,
      },
      tx
    );

    return sent;
  });

  logger.info('Sent engagement contract', {
    contractId: id,
    organizationId: ctx.organizationId,
  });

  return sentContract;
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

  // Load context data outside the transaction to avoid holding DB connections during I/O
  const matter = await db.query.matters.findFirst({
    where: (table, { and: andExpr, eq: eqExpr }) =>
      andExpr(eqExpr(table.id, contract.matter_id), eqExpr(table.organization_id, ctx.organizationId)),
  });

  if (!matter) {
    throw new HTTPException(404, { message: 'Associated matter not found' });
  }

  const clientId = matter.client_id;
  const client =
    clientId !== null
      ? await db.query.clients.findFirst({
          where: (table, { and: andExpr, eq: eqExpr }) =>
            andExpr(eqExpr(table.id, clientId), eqExpr(table.organization_id, ctx.organizationId)),
        })
      : null;

  const organization = await db.query.organizations.findFirst({
    where: (table, { eq: eqExpr }) => eqExpr(table.id, ctx.organizationId),
  });

  const acceptedAt = new Date();
  const clientName = client?.name ?? matter.on_behalf_of ?? 'Client';
  const clientEmail = client?.email ?? '';

  // Generate PDF and upload to R2 outside the transaction
  const pdfBuffer = await engagementContractPdfService.generatePdfBuffer(contract, {
    practiceName: organization?.name ?? 'Practice',
    clientName,
    matterTitle: matter.title,
    acceptedAt,
    clientIp,
  });

  const s3Key = await engagementContractPdfService.uploadPdfToR2({
    organizationId: contract.organization_id,
    contractId: contract.id,
    pdfBuffer,
  });

  const acceptedContract = await db.transaction(async (tx) => {
    const accepted = await engagementContractsQueries.update(
      id,
      {
        status: 'accepted',
        accepted_at: acceptedAt,
        signed_pdf_s3_key: s3Key,
        updated_at: new Date(),
      },
      tx
    );

    await tx
      .update(matters)
      .set({
        status: 'active',
        open_date: matter.open_date ?? acceptedAt,
        updated_at: new Date(),
      })
      .where(and(eq(matters.id, contract.matter_id), eq(matters.organization_id, ctx.organizationId)));

    await ctx.emit(
      EngagementContractAccepted,
      {
        contract_id: accepted.id,
        matter_id: accepted.matter_id,
        organization_id: accepted.organization_id,
        practice_email: organization?.billingEmail ?? '',
        practice_name: organization?.name ?? 'Practice',
        matter_title: matter.title,
        client_name: clientName,
        client_email: clientEmail,
        signed_pdf_s3_key: s3Key,
      },
      tx
    );

    return accepted;
  });

  logger.info('Accepted engagement contract', {
    contractId: id,
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

  const matter = await db.query.matters.findFirst({
    where: (table, { and: andExpr, eq: eqExpr }) =>
      andExpr(eqExpr(table.id, contract.matter_id), eqExpr(table.organization_id, ctx.organizationId)),
  });

  if (!matter) {
    throw new HTTPException(404, { message: 'Associated matter not found' });
  }

  const clientId = matter.client_id;
  const [client, organization] = await Promise.all([
    clientId !== null
      ? db.query.clients.findFirst({
          where: (table, { and: andExpr, eq: eqExpr }) =>
            andExpr(eqExpr(table.id, clientId), eqExpr(table.organization_id, ctx.organizationId)),
        })
      : Promise.resolve(null),
    db.query.organizations.findFirst({
      where: (table, { eq: eqExpr }) => eqExpr(table.id, ctx.organizationId),
    }),
  ]);

  const declinedContract = await db.transaction(async (tx) => {
    const declined = await engagementContractsQueries.update(
      id,
      {
        status: 'declined',
        declined_at: new Date(),
        updated_at: new Date(),
      },
      tx
    );

    await ctx.emit(
      EngagementContractDeclined,
      {
        contract_id: declined.id,
        matter_id: declined.matter_id,
        organization_id: declined.organization_id,
        practice_email: organization?.billingEmail ?? '',
        practice_name: organization?.name ?? 'Practice',
        matter_title: matter.title,
        client_name: client?.name ?? matter.on_behalf_of ?? 'Client',
      },
      tx
    );

    return declined;
  });

  logger.info('Declined engagement contract', {
    contractId: id,
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

  const { data, total } = await engagementContractsQueries.listByOrg(
    ctx.organizationId,
    {
      ...filters,
      limit,
      offset,
    },
    db
  );

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
