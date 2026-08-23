import { ForbiddenError } from '@casl/ability';
import { acceptEngagementContract as acceptEngagementContractOperation } from '@/modules/engagement-contracts/operations/accept-engagement-contract.operation';
import { createEngagementContract as createEngagementContractOperation } from '@/modules/engagement-contracts/operations/create-engagement-contract.operation';
import { declineEngagementContract as declineEngagementContractOperation } from '@/modules/engagement-contracts/operations/decline-engagement-contract.operation';
import { getEngagementContract as getEngagementContractOperation } from '@/modules/engagement-contracts/operations/get-engagement-contract.operation';
import { listEngagementContracts as listEngagementContractsOperation } from '@/modules/engagement-contracts/operations/list-engagement-contracts.operation';
import { sendEngagementContract as sendEngagementContractOperation } from '@/modules/engagement-contracts/operations/send-engagement-contract.operation';
import { updateEngagementContract as updateEngagementContractOperation } from '@/modules/engagement-contracts/operations/update-engagement-contract.operation';
import type {
  CreateEngagementContractRequest,
  EngagementContractRecord,
  ListEngagementContractsQuery,
  UpdateEngagementContractRequest,
} from '@/modules/engagement-contracts/types/engagement-contract.types';
import { toLegalOperationContext } from '@/shared/types/legal-operation-context';
import type { OffsetPaginatedResponse } from '@/shared/types/pagination';
import type { ServiceContext } from '@/shared/types/service-context';

const createEngagementContract = async (
  { data }: { data: CreateEngagementContractRequest },
  ctx: ServiceContext
): Promise<EngagementContractRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');

  return createEngagementContractOperation({ organizationId: ctx.organizationId, data }, toLegalOperationContext(ctx));
};

const updateEngagementContract = async (
  { id, data }: { id: string; data: UpdateEngagementContractRequest },
  ctx: ServiceContext
): Promise<EngagementContractRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');

  return updateEngagementContractOperation({ id, data }, toLegalOperationContext(ctx));
};

const sendEngagementContract = async (
  { id }: { id: string },
  ctx: ServiceContext
): Promise<EngagementContractRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');

  return sendEngagementContractOperation({ id }, toLegalOperationContext(ctx));
};

const acceptEngagementContract = async (
  { id, clientIp }: { id: string; clientIp?: string },
  ctx: ServiceContext
): Promise<EngagementContractRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');

  return acceptEngagementContractOperation({ id, clientIp }, toLegalOperationContext(ctx));
};

const declineEngagementContract = async (
  { id }: { id: string },
  ctx: ServiceContext
): Promise<EngagementContractRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');

  return declineEngagementContractOperation({ id }, toLegalOperationContext(ctx));
};

const listEngagementContracts = async (
  query: ListEngagementContractsQuery,
  ctx: ServiceContext
): Promise<OffsetPaginatedResponse<EngagementContractRecord>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');

  return listEngagementContractsOperation({ organizationId: ctx.organizationId, query }, toLegalOperationContext(ctx));
};

const getEngagementContract = async (
  { id }: { id: string },
  ctx: ServiceContext
): Promise<EngagementContractRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');

  return getEngagementContractOperation(id, toLegalOperationContext(ctx));
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
