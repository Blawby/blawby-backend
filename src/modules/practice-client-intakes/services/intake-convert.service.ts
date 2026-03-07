import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';

import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import type { MatterResponse } from '@/modules/matters/types/matter.types';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { executeConvertIntakeToMatterTx } from '@/modules/practice-client-intakes/services/intake-convert-transaction.helpers';
import {
  parseMetadata,
  resolveMatterStatus,
  resolvePaymentFrequency,
  resolveMatterUrgency,
} from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import type { ConvertIntakeRequest } from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { db } from '@/shared/database';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

const logger = getLogger(['practice-client-intakes', 'service', 'convert']);

/**
 * Convert a completed intake to a Matter
 */
const convertIntakeToMatter = async (
  params: {
    uuid: string;
    organizationId: string;
    actorUserId: string;
    data: ConvertIntakeRequest;
  },
  ctx: ServiceContext,
): Promise<Result<{ matter_id: string; matter: MatterResponse }>> => {
  const {
    uuid, organizationId, actorUserId, data,
  } = params;
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Organization');

  try {
    const intake = await practiceClientIntakesRepository.findById(uuid);

    if (!intake) {
      return result.notFound('Intake not found');
    }

    if (intake.organization_id !== organizationId) {
      return result.forbidden('Access denied');
    }

    if (intake.status === 'converted') {
      const existingMatter = await mattersQueries.findByIntakeUuid(uuid);
      if (existingMatter) {
        const existingMatterWithRelations = await mattersQueries.findMatterByIdWithRelations(existingMatter.id);
        if (!existingMatterWithRelations) {
          return result.conflict('Intake is marked as converted but no associated matter was found');
        }
        return result.ok({
          matter_id: existingMatter.id,
          matter: {
            ...existingMatterWithRelations,
            status: resolveMatterStatus(existingMatterWithRelations.status),
            payment_frequency: resolvePaymentFrequency(existingMatterWithRelations.payment_frequency),
            urgency: resolveMatterUrgency(existingMatterWithRelations.urgency),
            deleted_at: existingMatterWithRelations.deleted_at ?? null,
            open_date: existingMatterWithRelations.open_date ?? null,
            close_date: existingMatterWithRelations.close_date ?? null,
          } satisfies MatterResponse,
        });
      }
      return result.conflict('Intake is marked as converted but no associated matter was found');
    }

    if (intake.status !== 'succeeded') {
      return result.badRequest('Only successful intakes can be converted to matters');
    }

    if (intake.triage_status !== 'accepted') {
      return result.badRequest('Intake must be accepted before converting to a matter');
    }

    const metadata = parseMetadata(intake.metadata);
    if (!metadata) {
      return result.badRequest('Intake metadata is missing');
    }

    const matterId = await db.transaction(async (tx) => {
      return await executeConvertIntakeToMatterTx(tx, {
        uuid,
        organizationId,
        actorUserId,
        data,
        metadata: {
          user_id: metadata.user_id,
          name: metadata.name,
          description: metadata.description,
          on_behalf_of: metadata.on_behalf_of,
          opposing_party: metadata.opposing_party,
          opposing_counsel: metadata.opposing_counsel,
        },
        intake: {
          urgency: intake.urgency,
          conversation_id: intake.conversation_id,
          court_date: intake.court_date,
          desired_outcome: intake.desired_outcome,
          case_strength: intake.case_strength,
        },
      });
    });

    const matter = await mattersQueries.findMatterByIdWithRelations(matterId);
    if (!matter) {
      return result.internalError('Matter was created but could not be loaded');
    }

    return result.ok({
      matter_id: matterId,
      matter: {
        ...matter,
        status: resolveMatterStatus(matter.status),
        payment_frequency: resolvePaymentFrequency(matter.payment_frequency),
        urgency: resolveMatterUrgency(matter.urgency),
        deleted_at: matter.deleted_at ?? null,
        open_date: matter.open_date ?? null,
        close_date: matter.close_date ?? null,
      } satisfies MatterResponse,
    });
  } catch (error) {
    logger.error('Failed to convert intake {uuid} to matter: {error}', { uuid, error });
    return result.internalError('Failed to convert intake to matter');
  }
};

export const intakeConvertService = {
  convertIntakeToMatter,
};
