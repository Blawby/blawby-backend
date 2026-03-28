/**
 * Client Intake Creation Service
 *
 * Handles intake-based client creation
 */

import { and, eq, isNull } from 'drizzle-orm';
import { resolveUserForIntake } from '@/modules/clients/services/clients-utils';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { clients, type SelectClient } from '@/modules/clients/database/schema/clients.schema';
import { db } from '@/shared/database';
import { ClientCreated, ClientUpdated } from '@/shared/events/definitions';
import type { ServiceContext } from '@/shared/types/service-context';
import { ensureClientMember } from '@/modules/clients/services/clients-creation.helpers';
import { getLogger } from '@logtape/logtape';

const logger = getLogger(['clients', 'intake-creation-service']);
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Create a client from an intake submission
 */
const createClientFromIntake = async (
  params: {
    data: {
      intakeId: string;
      userId?: string;
      email: string;
      name: string;
      phone?: string;
    };
    tx?: DbOrTx;
  },
  ctx: ServiceContext
): Promise<SelectClient> => {
  const { intakeId, userId, email, name, phone } = params.data;

  const intake = await practiceClientIntakesRepository.findById(intakeId);
  if (!intake) {
    throw new Error(`Intake record with ID '${intakeId}' not found`);
  }

  const runTx = async (tx: DbOrTx) => {
    const user = await resolveUserForIntake({
      userId,
      email,
      name,
      phone,
    });
    if (!user) {
      throw new Error('Unable to resolve user for intake.');
    }

    await ensureClientMember({
      organizationId: ctx.organizationId,
      userId: user.id,
      tx,
    });

    // Use upsert to handle concurrent creation race conditions
    // and provide atomic updates if they already exist without an intake link
    const [detail] = await tx
      .insert(clients)
      .values({
        organization_id: ctx.organizationId,
        user_id: user.id,
        name: user.name,
        email: user.email,
        intake_id: intakeId,
        address_id: intake.address_id ?? undefined,
        stripe_customer_id: null,
        status: 'active',
        event_name: 'client_intake_success',
      })
      .onConflictDoUpdate({
        target: [clients.organization_id, clients.user_id],
        set: {
          intake_id: intakeId,
          status: 'active',
          updated_at: new Date(),
        },
      })
      .returning();

    if (!detail) {
      throw new Error('Failed to upsert client from intake');
    }

    // Always dispatch ClientCreated for new/updated sync from intake
    // Logic for avoiding duplicate setup is handled in downstream event listeners/services
    await ClientCreated.dispatch(
      {
        client_id: detail.id,
        user_id: user.id,
        name: user.name,
        email: user.email,
        stripe_customer_id: detail.stripe_customer_id ?? undefined,
      },
      { actorId: 'system', actorType: 'system', organizationId: ctx.organizationId, tx }
    );

    return detail;
  };

  const outcome = params.tx ? await runTx(params.tx) : await db.transaction(runTx).catch((error) => {
    logger.error('Failed to process client intake creation transaction: {error}', { error, intakeId });
    throw error;
  });

  return outcome;
};

export const clientsIntakeCreationService = {
  createClientFromIntake,
};
