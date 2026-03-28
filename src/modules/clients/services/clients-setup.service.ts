/**
 * Client Setup Service
 *
 * Handles client setup operations (Stripe customer creation)
 */

import { clientsStripeService } from '@/modules/clients/services/clients-stripe.service';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import { type SelectClient } from '@/modules/clients/database/schema/clients.schema';
import { type SelectUser } from '@/shared/repositories/users.repository';
import { db } from '@/shared/database';
import { ClientUpdated } from '@/shared/events/definitions';
import usersRepository from '@/shared/repositories/users.repository';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

/**
 * Ensure client has Stripe customer ID (idempotent, two-phase lazy setup)
 */
const ensureClientSetup = async (
  params: { id: string },
  ctx: ServiceContext
): Promise<Result<SelectClient & { user: SelectUser | null }>> => {
  const { id } = params;

  // Phase 1: Validate and check existing state (Transaction 1)
  const validationResult = await db.transaction(async (tx): Promise<Result<{ client: SelectClient }>> => {
    // Basic lock to ensure we don't have multiple concurrent starts for the same client
    const lockedClient = await clientsRepository.findByIdForUpdate(id, tx);
    if (!lockedClient || lockedClient.organization_id !== ctx.organizationId || lockedClient.deleted_at !== null) {
      return result.notFound('Client details not found');
    }

    if (lockedClient.stripe_customer_id) {
      return result.ok({ client: lockedClient });
    }

    if (!lockedClient.email || !lockedClient.name) {
      return result.fail('Client is missing email or name for Stripe customer creation', 400, 'MISSING_CLIENT_INFO');
    }

    // Set a claim marker to prevent concurrent search/create calls
    await clientsRepository.update(id, { stripe_customer_id: 'PENDING_CREATE' }, tx);

    return result.ok({ client: lockedClient });
  });

  if (!validationResult.success) {
    return validationResult;
  }

  // If already setup, just resolve the user and return
  if (validationResult.data.client.stripe_customer_id) {
    const user = validationResult.data.client.user_id
      ? ((await usersRepository.findById(validationResult.data.client.user_id)) ?? null)
      : null;
    return result.ok({ ...validationResult.data.client, user });
  }

  const { client } = validationResult.data;

  // Phase 2: External Stripe Call (Outside any database transaction)
  // 1. First, search by metadata to handle retries/concurrency without manual pending flags
  const stripeSearchResult = await clientsStripeService.findCustomerByMetadata({ client_id: id }, ctx);
  if (!stripeSearchResult.success) {
    // If search fails, we must clear our claim marker so it can be retried
    await db.transaction(async (tx) => {
      await clientsRepository.update(id, { stripe_customer_id: null }, tx);
    });
    return stripeSearchResult;
  }

  let stripeCustomerId = stripeSearchResult.data;

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

  if (!persistResult.success) {
    return persistResult;
  }

  const user = persistResult.data.user_id ? await usersRepository.findById(persistResult.data.user_id) : null;
  return result.ok({ ...persistResult.data, user: user ?? null });
};

export const clientsSetupService = {
  ensureClientSetup,
};
