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
  },
  ctx: ServiceContext
): Promise<SelectClient> => {
  const { intakeId, userId, email, name, phone } = params.data;

  const intake = await practiceClientIntakesRepository.findById(intakeId);
  if (!intake) {
    throw new Error(`Intake record with ID '${intakeId}' not found`);
  }

  const user = await resolveUserForIntake({
    userId,
    email,
    name,
    phone,
  });
  if (!user) {
    throw new Error('Unable to process intake.');
  }

  await ensureClientMember({
    organizationId: ctx.organizationId,
    userId: user.id,
  });

  const outcome = await db.transaction(async (tx) => {
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

        if (updatedDetail) {
          return { action: 'updated' as const, detail: updatedDetail };
        }
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

    return { action: 'created' as const, detail: createdDetail };
  });

  if (outcome.action === 'updated') {
    void ClientUpdated.dispatch(
      {
        client_id: outcome.detail.id,
        changes: { intake_id: true, status: true },
      },
      { actorId: 'system', actorType: 'system', organizationId: ctx.organizationId }
    );
  }

  if (outcome.action === 'created') {
    void ClientCreated.dispatch(
      {
        client_id: outcome.detail.id,
        user_id: user.id,
        name: user.name,
        email: user.email,
        stripe_customer_id: outcome.detail.stripe_customer_id ?? undefined,
      },
      { actorId: 'system', actorType: 'system', organizationId: ctx.organizationId }
    );
  }

  return outcome.detail;
};

export const clientsIntakeCreationService = {
  createClientFromIntake,
};
