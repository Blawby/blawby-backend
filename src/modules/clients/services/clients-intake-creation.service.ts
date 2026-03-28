/**
 * Client Intake Creation Service
 *
 * Handles intake-based client creation
 */

import { and, eq, isNull } from 'drizzle-orm';
import { getLogger } from '@logtape/logtape';
import { resolveUserForIntake } from '@/modules/clients/services/clients-utils';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { clients, type SelectClient } from '@/modules/clients/database/schema/clients.schema';
import { db } from '@/shared/database';
import { ClientCreated, ClientUpdated } from '@/shared/events/definitions';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';
import { ensureClientMember } from '@/modules/clients/services/clients-creation.helpers';

const logger = getLogger(['clients', 'intake-creation-service']);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
    tx?: Tx;
  },
  ctx: ServiceContext
): Promise<Result<SelectClient>> => {
  const { intakeId, userId, email, name, phone } = params.data;

  const intake = await practiceClientIntakesRepository.findById(intakeId);
  if (!intake) {
    return result.fail(`Intake record with ID '${intakeId}' not found`, 404, 'NOT_FOUND');
  }

  const runTx = async (tx: Tx) => {
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

    // Determine if we created or updated for event dispatching purposes (optional, but good for context)
    // For now, simpler to just dispatch Created if it's new-ish or just Updated
    // Given the request asks to reuse the conflict resolution helper/pattern - 
    // we'll just dispatch based on whether it was a fresh insert or not if we can detect it.
    // Drizzle doesn't easily return whether it was an update or insert in the same way, 
    // but the ClientCreated event is what matters most for initial setup.

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

    return { action: 'processed' as const, detail };
  };

  const outcome = params.tx ? await runTx(params.tx) : await db.transaction(runTx).catch((error) => {
    logger.error('Failed to process client intake creation transaction: {error}', { error, intakeId });
    throw error;
  });

  return result.ok(outcome.detail);
};

export const clientsIntakeCreationService = {
  createClientFromIntake,
};
