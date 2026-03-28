/**
 * Client Setup Service
 *
 * Handles client setup operations (Stripe customer creation)
 */

import { clientsStripeService } from '@/modules/clients/services/clients-stripe.service';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import { type SelectClient } from '@/modules/clients/database/schema/clients.schema';
import { type SelectUser, usersRepository } from '@/shared/repositories/users.repository';
import { db } from '@/shared/database';
import { ClientUpdated } from '@/shared/events/definitions';
import type { ServiceContext } from '@/shared/types/service-context';
import { HTTPException } from 'hono/http-exception';

/**
 * Ensure client has Stripe customer ID (idempotent, two-phase lazy setup)
 */
const ensureClientSetup = async (
  params: { id: string },
  ctx: ServiceContext
): Promise<SelectClient & { user: SelectUser | null }> => {
  const { id } = params;

  const clearPendingStripeCustomerClaim = async () => {
    await db.transaction(async (tx) => {
      await clientsRepository.update(id, { stripe_customer_id: null }, tx);
    });
  };

  // Phase 1: Validate and check existing state (Transaction 1)
  const validation = await db.transaction(async (tx): Promise<{ client: SelectClient }> => {
    // Basic lock to ensure we don't have multiple concurrent starts for the same client
    const lockedClient = await clientsRepository.findByIdForUpdate(id, tx);
    if (!lockedClient || lockedClient.organization_id !== ctx.organizationId || lockedClient.deleted_at !== null) {
      throw new HTTPException(404, { message: 'Client details not found' });
    }

    if (lockedClient.stripe_customer_id) {
      return { client: lockedClient };
    }

    if (!lockedClient.email || !lockedClient.name) {
      throw new HTTPException(400, { message: 'Client is missing email or name for Stripe customer creation' });
    }

    // Set a claim marker to prevent concurrent search/create calls
    await clientsRepository.update(id, { stripe_customer_id: 'PENDING_CREATE' }, tx);

    return { client: lockedClient };
  });

  // If already setup, just resolve the user and return
  if (validation.client.stripe_customer_id) {
    const user = validation.client.user_id
      ? ((await usersRepository.findById(validation.client.user_id)) ?? null)
      : null;
    return { ...validation.client, user };
  }

  const { client } = validation;

  let stripeCustomerId: string | undefined = undefined;

  try {
    // Phase 2: External Stripe Call (Outside any database transaction)
    // 1. First, search by metadata to handle retries/concurrency without manual pending flags
    stripeCustomerId = await clientsStripeService.findCustomerByMetadata({ client_id: id }, ctx);

    // 2. Create if not found
    stripeCustomerId ??= await clientsStripeService.createCustomer(
      {
        email: client.email!,
        name: client.name!,
        metadata: {
          organization_id: ctx.organizationId,
          source: 'auto_vivification_sync',
          client_id: id,
        },
      },
      ctx
    );
  } catch (error) {
    await clearPendingStripeCustomerClaim();
    throw error;
  }

  if (!stripeCustomerId) {
    await clearPendingStripeCustomerClaim();
    throw new Error(`Failed to create/resolve Stripe customer for client ${id}`);
  }

  // Phase 3: Persist and Dispatch (Transaction 2)
  const persistedClient = await db.transaction(async (tx): Promise<SelectClient> => {
    const lockedClient = await clientsRepository.findByIdForUpdate(id, tx);

    if (!lockedClient || lockedClient.organization_id !== ctx.organizationId || lockedClient.deleted_at !== null) {
      throw new HTTPException(404, { message: 'Client details not found during final persisting' });
    }

    // Double-check in case someone else won the race or already finished
    if (lockedClient.stripe_customer_id && lockedClient.stripe_customer_id !== 'PENDING_CREATE') {
      return lockedClient;
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

    await ClientUpdated.dispatch(
      {
        client_id: updatedClient.id,
        changes: { stripe_customer_id: true },
      },
      { actorId: ctx.userId, organizationId: ctx.organizationId, tx }
    );

    return updatedClient;
  });

  const user = persistedClient.user_id ? await usersRepository.findById(persistedClient.user_id) : null;
  return { ...persistedClient, user: user ?? null };
};

export const clientsSetupService = {
  ensureClientSetup,
};
