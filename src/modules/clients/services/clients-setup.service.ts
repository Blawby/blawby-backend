/**
 * Client Setup Service
 *
 * Handles client setup operations (Stripe customer creation)
 */

import { clientsStripeService } from '@/modules/clients/services/clients-stripe.service';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import { type SelectClient } from '@/modules/clients/database/schema/clients.schema';
import { db } from '@/shared/database';
import { ClientUpdated } from '@/shared/events/definitions';
import usersRepository from '@/shared/repositories/users.repository';
import type { ServiceContext } from '@/shared/types/service-context';
import type { Result } from '@/shared/types/result';
import { result } from '@/shared/utils/result';

/**
 * Ensure client has Stripe customer ID (lazy setup)
 * Uses a 3-phase atomic approach to prevent race conditions during Stripe creation
 */
const ensureClientSetup = async (
  params: { id: string },
  ctx: ServiceContext
): Promise<Result<SelectClient & { user: unknown | null }>> => {
  const { id } = params;

  // Phase 1: Validate and check existing state (Transaction 1)
  const validationResult = await db.transaction(async (tx): Promise<Result<{ client: SelectClient }>> => {
    // Basic lock to ensure we don't have multiple concurrent starts for the same client
    const lockedClient = await clientsRepository.findByIdForUpdate(id, tx);
    if (!lockedClient || lockedClient.organization_id !== ctx.organizationId || lockedClient.deleted_at !== null) {
      return result.notFound('Client details not found');
    }

    if (lockedClient.stripe_customer_id && lockedClient.stripe_customer_id !== 'PENDING_CREATE') {
      return result.ok({ client: lockedClient });
    }

    if (!lockedClient.email || !lockedClient.name) {
      return result.badRequest('Client is missing email or name for Stripe customer creation');
    }

    // Set a claim marker to prevent concurrent search/create calls
    const updated = await clientsRepository.update(id, { stripe_customer_id: 'PENDING_CREATE' }, tx);
    return result.ok({ client: updated! });
  });

  if (!validationResult.success) {
    return validationResult;
  }

  // If already setup, resolve user and return
  if (
    validationResult.data.client.stripe_customer_id &&
    validationResult.data.client.stripe_customer_id !== 'PENDING_CREATE'
  ) {
    const user = validationResult.data.client.user_id
      ? ((await usersRepository.findById(validationResult.data.client.user_id)) ?? null)
      : null;
    return result.ok({ ...validationResult.data.client, user });
  }

  const { client } = validationResult.data;

  // Phase 2: External Stripe Call (Outside any database transaction)
  // 1. First, search by metadata to handle retries/concurrency without manual pending flags
  const stripeCustomerIdFromLookup = await clientsStripeService.findCustomerByMetadata({ client_id: id }, ctx);

  let stripeCustomerId = stripeCustomerIdFromLookup;

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

  if (!stripeCustomerId) {
    // Clear claim on failure
    await db.transaction(async (tx) => {
      await clientsRepository.update(id, { stripe_customer_id: null }, tx);
    });
    return result.fail(`Failed to create/resolve Stripe customer for client ${id}`, 500, 'STRIPE_SETUP_FAILED');
  }

  // Phase 3: Persist and Dispatch (Transaction 2)
  const persistResult = await db.transaction(async (tx): Promise<Result<SelectClient>> => {
    const lockedClient = await clientsRepository.findByIdForUpdate(id, tx);

    if (!lockedClient || lockedClient.organization_id !== ctx.organizationId || lockedClient.deleted_at !== null) {
      return result.notFound('Client details not found during final persisting');
    }

    // Double-check in case someone else won the race or already finished
    if (lockedClient.stripe_customer_id && lockedClient.stripe_customer_id !== 'PENDING_CREATE') {
      return result.ok(lockedClient);
    }

    const updatedClient = await clientsRepository.update(
      id,
      {
        stripe_customer_id: stripeCustomerId,
      },
      tx
    );

    if (!updatedClient) {
      return result.internalError('Failed to persist Stripe customer on client');
    }

    void ClientUpdated.dispatch(
      {
        client_id: updatedClient.id,
        changes: { stripe_customer_id: true },
      },
      { actorId: ctx.userId, organizationId: ctx.organizationId, tx }
    );

    return result.ok(updatedClient);
  });

  if (!persistResult.success) {
    return persistResult;
  }

  const finalClient = persistResult.data;
  const user = finalClient.user_id ? ((await usersRepository.findById(finalClient.user_id)) ?? null) : null;
  return result.ok({ ...finalClient, user });
};

export const clientsSetupService = {
  ensureClientSetup,
};
