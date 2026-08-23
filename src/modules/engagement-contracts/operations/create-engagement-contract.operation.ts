import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

import { engagementContractsQueries } from '@/modules/engagement-contracts/database/queries/engagement-contracts.queries';
import type { SelectEngagementContract } from '@/modules/engagement-contracts/database/schema/engagement-contracts.schema';
import {
  assertHumanActor,
  getTenantIntake,
} from '@/modules/engagement-contracts/operations/engagement-contract-access.helpers';
import { intakeSharedHelpers } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import type {
  CreateEngagementContractRequest,
  EngagementContractRecord,
} from '@/modules/engagement-contracts/types/engagement-contract.types';
import { uow } from '@/shared/database/uow';
import { EngagementContractCreated } from '@/shared/events/definitions';
import { emitLegalEvent } from '@/shared/events/emit-legal-event';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';

const logger = getLogger(['engagement-contracts', 'create-engagement-contract-operation']);

const isUniqueConstraintViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';

/**
 * Create a draft engagement contract for an accepted intake. Preserves the default proposal
 * source-snapshot facts and the created event from the pre-extraction service.
 */
export const createEngagementContract = async (
  { organizationId, data }: { organizationId: string; data: CreateEngagementContractRequest },
  ctx: LegalOperationContext
): Promise<EngagementContractRecord> => {
  assertLegalOperationTenant(ctx, organizationId);
  const userId = assertHumanActor(ctx);

  const intake = await getTenantIntake(data.intake_id, organizationId);

  if (intake.triage_status !== 'accepted') {
    throw new HTTPException(400, { message: 'Intake must be accepted before creating an engagement contract' });
  }

  const existingContract = await engagementContractsQueries.findAcceptedByIntakeAndOrg(data.intake_id, organizationId);
  if (existingContract?.status === 'accepted') {
    throw new HTTPException(409, { message: 'An accepted engagement contract already exists for this intake' });
  }

  const metadata = intakeSharedHelpers.parseMetadata(intake.metadata);

  const contract = await uow.transaction(async () => {
    try {
      const created = await engagementContractsQueries.insert({
        intake_id: data.intake_id,
        organization_id: organizationId,
        status: 'draft',
        contract_body: data.contract_body ?? null,
        engagement_notes: data.engagement_notes ?? null,
        // SAFETY: see the identical proposal_data note in update-engagement-contract.operation.ts —
        // Zod's `.optional()` numeric fields never carry a literal `undefined` at runtime.
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
        created_by: userId,
      });

      await emitLegalEvent(ctx, EngagementContractCreated, {
        contract_id: created.id,
        intake_id: created.intake_id,
        organization_id: created.organization_id,
      });

      return created;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new HTTPException(409, { message: 'An accepted engagement contract already exists for this intake' });
      }
      throw error;
    }
  });

  logger.info('Created engagement contract', {
    contractId: contract.id,
    intakeId: contract.intake_id,
    organizationId,
  });

  return contract;
};
