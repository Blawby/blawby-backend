/**
 * Client Setup Service
 *
 * Handles client setup operations (Stripe customer creation)
 */

import { clientsStripeService } from '@/modules/clients/services/clients-stripe.service';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import { clients } from '@/modules/clients/database/schema/clients.schema';
import type { SelectClient } from '@/modules/clients/database/schema/clients.schema';
import type { users } from '@/schema/better-auth-schema';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/shared/database';
import { ClientUpdated } from '@/shared/events/definitions';
import usersRepository from '@/shared/repositories/users.repository';
import type { ServiceContext } from '@/shared/types/service-context';

/**
 * Ensure client has Stripe customer ID (lazy setup)
 */
const ensureClientSetup = async (
  params: { id: string },
  ctx: ServiceContext
): Promise<SelectClient & { user: typeof users.$inferSelect | null }> => {
  const { id } = params;

  const setupResult = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM "clients" WHERE "id" = ${id} FOR UPDATE`);

    const [lockedClient] = await tx.select().from(clients).where(eq(clients.id, id)).limit(1);

    if (!lockedClient || lockedClient.organization_id !== ctx.organizationId || lockedClient.deleted_at !== null) {
      throw new Error('Client details not found');
    }

    if (lockedClient.stripe_customer_id) {
      return lockedClient;
    }

    if (!lockedClient.email || !lockedClient.name) {
      throw new Error('Client is missing email or name for Stripe customer creation');
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
      throw new Error(`Failed to create Stripe customer for client ${lockedClient.id}`);
    }

    const updatedClient = await clientsRepository.update(
      id,
      {
        stripe_customer_id: stripeCustomerId,
      },
      tx
    );

    if (!updatedClient) {
      throw new Error('Failed to persist Stripe customer on client');
    }

    void ClientUpdated.dispatch(
      {
        client_id: updatedClient.id,
        changes: { stripe_customer_id: true },
      },
      { actorId: ctx.userId, organizationId: ctx.organizationId, tx }
    );

    return updatedClient;
  });

  const user = setupResult.user_id ? ((await usersRepository.findById(setupResult.user_id)) ?? null) : null;
  return { ...setupResult, user };
};

export const clientsSetupService = {
  ensureClientSetup,
};
