import { getLogger } from '@logtape/logtape';

import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import { matterMilestones } from '@/modules/matters/database/schema/matter-milestones.schema';
import { matterNotes } from '@/modules/matters/database/schema/matter-notes.schema';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { DbTransaction } from '@/modules/practice-client-intakes/services/intake-transactions.helpers';
import type { ConvertIntakeRequest } from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { userDetailsRepository } from '@/modules/user-details/database/queries/user-details.queries';

const logger = getLogger(['practice-client-intakes', 'helpers', 'convert-transaction']);

export interface ConvertIntakeToMatterTxParams {
  uuid: string;
  organizationId: string;
  actorUserId: string;
  data: {
    title?: string;
    responsible_attorney_id?: string;
    practice_service_id?: string;
    billing_type?: 'hourly' | 'fixed' | 'contingency' | 'pro_bono';
    status?: ConvertIntakeRequest['status'];
    open_date?: string;
  };
  metadata: {
    user_id?: string;
    name?: string;
    description?: string;
    on_behalf_of?: string;
    opposing_party?: string;
    opposing_counsel?: string;
  };
  intake: {
    urgency?: string | null;
    conversation_id?: string | null;
    court_date?: Date | null;
    desired_outcome?: string | null;
    case_strength?: number | null;
  };
}

export const executeConvertIntakeToMatterTx = async (
  tx: DbTransaction,
  params: ConvertIntakeToMatterTxParams,
): Promise<string> => {
  const {
    uuid, organizationId, actorUserId, data, metadata, intake,
  } = params;

  // 1. Verify client_id exists in user_details if provided
  let clientId: string | undefined = undefined;
  if (metadata.user_id) {
    const userDetailsRecord = await userDetailsRepository.findById(metadata.user_id);
    if (userDetailsRecord) {
      clientId = metadata.user_id;
    } else {
      logger.warn('User ID {userId} from intake metadata not found in user_details, creating matter without client_id', {
        userId: metadata.user_id,
        intakeUuid: uuid,
      });
    }
  }

  // 2. Create Matter
  const matter = await mattersQueries.createMatter(
    {
      organization_id: organizationId,
      billing_type: data.billing_type ?? 'fixed',
      client_id: clientId,
      title: data.title ?? `Intake: ${metadata.name}`,
      description: metadata.description,
      status: data.status ?? 'engagement_pending',
      urgency: intake.urgency ?? 'routine',
      intake_uuid: uuid,
      conversation_id: intake.conversation_id,
      on_behalf_of: metadata.on_behalf_of,
      opposing_party: metadata.opposing_party,
      opposing_counsel: metadata.opposing_counsel,
      responsible_attorney_id: data.responsible_attorney_id,
      practice_service_id: data.practice_service_id,
      open_date: data.open_date ? new Date(data.open_date) : undefined,
    },
    tx,
  );

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
      user_id: actorUserId,
      content: `Desired outcome: ${intake.desired_outcome}`,
    });
  }

  if (typeof intake.case_strength === 'number') {
    await tx.insert(matterNotes).values({
      matter_id: matter.id,
      user_id: actorUserId,
      content: `Case strength score from intake: ${intake.case_strength}`,
    });
  }

  // Update Intake Status
  await practiceClientIntakesRepository.updateStatus(uuid, 'converted', tx);

  return matter.id;
};
