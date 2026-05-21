import type { z } from '@hono/zod-openapi';
import type { SelectEngagementContract } from '@/modules/engagement-contracts/database/schema/engagement-contracts.schema';
import { engagementContractValidations } from '@/modules/engagement-contracts/validations/engagement-contract.validation';

export type { EngagementContractStatus, ProposalData } from '@/modules/engagement-contracts/types/proposal-data.types';

export const createEngagementContractRequestSchema = engagementContractValidations.createEngagementContractSchema;
export const updateEngagementContractRequestSchema = engagementContractValidations.updateEngagementContractSchema;
export const engagementContractResponseSchema = engagementContractValidations.engagementContractSchema;
export const listEngagementContractsQuerySchema = engagementContractValidations.listEngagementContractsQuerySchema;

export type CreateEngagementContractRequest = z.infer<typeof createEngagementContractRequestSchema>;
export type UpdateEngagementContractRequest = z.infer<typeof updateEngagementContractRequestSchema>;
export type EngagementContractRecord = SelectEngagementContract;
export type ListEngagementContractsQuery = z.infer<typeof listEngagementContractsQuerySchema>;
