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

  const user = await resolveUserForIntake({
    userId,
    email,
    name,
    phone,
  });
  if (!user) {
    return result.fail('Unable to process intake.', 400, 'BAD_REQUEST');
  }

  const runTx = async (tx: Tx) => {
    await ensureClientMember({
      organizationId: ctx.organizationId,
      userId: user.id,
      tx,
    });

    const [existingDetail] = await tx
      .select()
      .from(clients)
      .where(
        and(eq(clients.organization_id, ctx.organizationId), eq(clients.user_id, user.id), isNull(clients.deleted_at))
      )
      .limit(1);

    if (existingDetail) {
      if (!existingDetail.intake_id) {
        const [updatedDetail] = await tx
          .update(clients)
          .set({ intake_id: intakeId, status: 'active', updated_at: new Date() })
          .where(eq(clients.id, existingDetail.id))
          .returning();

        if (!updatedDetail) {
          throw new Error('Failed to update client with intake_id');
        }

        Promise.resolve(
          ClientUpdated.dispatch(
            {
              client_id: updatedDetail.id,
              changes: { intake_id: true, status: true },
            },
            { actorId: 'system', actorType: 'system', organizationId: ctx.organizationId, tx }
          )
        ).catch((error) => {
          logger.error(
            'Failed to dispatch ClientUpdated for intake-created client {clientId} {organizationId}: {error}',
            {
              clientId: updatedDetail.id,
              organizationId: ctx.organizationId,
              error,
            }
          );
        });

        return { action: 'updated' as const, detail: updatedDetail };
      }

      return { action: 'existing' as const, detail: existingDetail };
    }

    const [createdDetail] = await tx
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
      .returning();

    if (!createdDetail) {
      throw new Error('Failed to create client from intake');
    }

    Promise.resolve(
      ClientCreated.dispatch(
        {
          client_id: createdDetail.id,
          user_id: user.id,
          name: user.name,
          email: user.email,
          stripe_customer_id: createdDetail.stripe_customer_id ?? undefined,
        },
        { actorId: 'system', actorType: 'system', organizationId: ctx.organizationId, tx }
      )
    ).catch((error) => {
      logger.error('Failed to dispatch ClientCreated for intake-created client {clientId} {organizationId}: {error}', {
        clientId: createdDetail.id,
        organizationId: ctx.organizationId,
        error,
      });
    });

    return { action: 'created' as const, detail: createdDetail };
  };

  const outcome = params.tx ? await runTx(params.tx) : await db.transaction(runTx);

  return result.ok(outcome.detail);
};

export const clientsIntakeCreationService = {
  createClientFromIntake,
};
