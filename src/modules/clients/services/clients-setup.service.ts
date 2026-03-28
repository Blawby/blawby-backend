/**
 * Client Setup Service
 *
 * Handles client setup operations (Stripe customer creation)
 */

import { clientsStripeService } from '@/modules/clients/services/clients-stripe.service';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import { clients, type SelectClient } from '@/modules/clients/database/schema/clients.schema';
import type { users } from '@/schema/better-auth-schema';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/shared/database';
import { ClientUpdated } from '@/shared/events/definitions';
import usersRepository from '@/shared/repositories/users.repository';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

/**
 * Ensure client has Stripe customer ID (lazy setup)
 */
const ensureClientSetup = async (
  params: { id: string },
  ctx: ServiceContext
): Promise<Result<SelectClient & { user: typeof users.$inferSelect | null }>> => {
  const { id } = params;

  const setupResult = await db.transaction(async (tx): Promise<Result<SelectClient>> => {
    await tx.execute(sql`SELECT 1 FROM "clients" WHERE "id" = ${id} FOR UPDATE`);

    const [lockedClient] = await tx.select().from(clients).where(eq(clients.id, id)).limit(1);

    if (!lockedClient || lockedClient.organization_id !== ctx.organizationId || lockedClient.deleted_at !== null) {
      return result.notFound('Client details not found');
    }

    if (lockedClient.stripe_customer_id) {
      return result.ok(lockedClient);
    }

    if (!lockedClient.email || !lockedClient.name) {
      return result.fail('Client is missing email or name for Stripe customer creation', 400, 'MISSING_CLIENT_INFO');
    }

    const stripeCustomerId = await clientsStripeService.createCustomer(
      {
        email: lockedClient.email,
        name: lockedClient.name,
        metadata: {
          organization_id: ctx.organizationId,
          source: 'auto_vivification_sync',
          client_id: lockedClient.id,
        },
      },
      ctx
    );

    if (!stripeCustomerId) {
      return result.fail(
        `Failed to create Stripe customer for client ${lockedClient.id}`,
        500,
        'STRIPE_CUSTOMER_CREATION_FAILED'
      );
    }

    const updatedClient = await clientsRepository.update(
      id,
      {
        stripe_customer_id: stripeCustomerId,
      },
      tx
    );

    if (!updatedClient) {
      return result.fail('Failed to persist Stripe customer on client', 500, 'PERSIST_FAILED');
    }

    await ClientUpdated.dispatch(
      {
        client_id: updatedClient.id,
        changes: { stripe_customer_id: true },
      },
      { actorId: ctx.userId, organizationId: ctx.organizationId, tx }
    );

    return result.ok(updatedClient);
  });

  if (!setupResult.success) {
    return setupResult;
  }

  const user = setupResult.data.user_id ? ((await usersRepository.findById(setupResult.data.user_id)) ?? null) : null;
  return result.ok({ ...setupResult.data, user });
};

export const clientsSetupService = {
  ensureClientSetup,
};
