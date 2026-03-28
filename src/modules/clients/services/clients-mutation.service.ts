/**
 * Client Mutation Service
 *
 * Handles write operations for clients (update, delete)
 */

import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { clientsStripeService } from '@/modules/clients/services/clients-stripe.service';
import { upsertAddressTx } from '@/modules/practice/database/queries/address.repository';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import { clients, type SelectClient } from '@/modules/clients/database/schema/clients.schema';
import type { AddressInput } from '@/modules/clients/types';
import { toSubject } from '@/shared/auth/subject-helpers';
import { db } from '@/shared/database';
import { ClientUpdated, ClientDeleted } from '@/shared/events/definitions';
import usersRepository from '@/shared/repositories/users.repository';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

const logger = getLogger(['clients', 'mutation-service']);

/**
 * Update a client
 */
const updateClient = async (
  params: {
    id: string;
    data: {
      name?: string;
      email?: string;
      phone?: string;
      address?: AddressInput;
      status?: string;
      currency?: string;
    };
  },
  ctx: ServiceContext
): Promise<Result<SelectClient>> => {
  const { id, data } = params;

  // Pre-transaction read for early permission check (prevents logging 403 as 500)
  const preCheckDetail = await clientsRepository.findById(id);
  if (!preCheckDetail || preCheckDetail.organization_id !== ctx.organizationId) {
    return result.notFound<SelectClient>('Client not found');
  }
  if (ctx.ability.cannot('update', toSubject('Client', preCheckDetail))) {
    return result.forbidden<SelectClient>('You do not have permission to update this client');
  }

  const updated = await db.transaction(async (tx) => {
    // Re-verify and lock inside transaction to prevent race conditions
    const lockedClient = await clientsRepository.findById(id, tx);
    if (!lockedClient || lockedClient.organization_id !== ctx.organizationId) {
      return result.notFound<SelectClient>('Client not found');
    }

    if (data.name || data.email || data.phone) {
      const updatePayload: Partial<typeof clients.$inferInsert> = {};
      if (data.name) {
        updatePayload.name = data.name;
      }
      if (data.email) {
        updatePayload.email = data.email;
      }

      if (Object.keys(updatePayload).length > 0) {
        await tx.update(clients).set(updatePayload).where(eq(clients.id, id));
      }

      if (lockedClient.user_id && (data.name !== undefined || data.email !== undefined || data.phone !== undefined)) {
        const userUpdatePayload: {
          name?: string;
          email?: string;
          phone?: string;
        } = {};

        if (data.name !== undefined) {
          userUpdatePayload.name = data.name;
        }
        if (data.email !== undefined) {
          userUpdatePayload.email = data.email.toLowerCase();
        }
        if (data.phone !== undefined) {
          userUpdatePayload.phone = data.phone;
        }

        if (Object.keys(userUpdatePayload).length > 0) {
          await usersRepository.update(lockedClient.user_id, userUpdatePayload, tx);
        }
      }
    }

    let addressId = lockedClient.address_id;
    if (data.address) {
      const address = await upsertAddressTx(tx, {
        addressData: {
          line1: data.address.line1,
          line2: data.address.line2,
          city: data.address.city,
          state: data.address.state,
          postal_code: data.address.postal_code,
          country: data.address.country ?? 'US',
        },
        organizationId: ctx.organizationId,
        addressId: lockedClient.address_id,
        type: 'client',
      });
      addressId = address?.id ?? addressId;
    }

    const finalUpdatePayload: Partial<typeof clients.$inferInsert> = {};
    if (data.address) {
      finalUpdatePayload.address_id = addressId;
    }
    if (data.status !== undefined) {
      finalUpdatePayload.status = data.status;
    }
    if (data.currency !== undefined) {
      finalUpdatePayload.currency = data.currency;
    }

    const updatedRecord = await clientsRepository.update(id, finalUpdatePayload, tx);

    if (!updatedRecord) {
      return result.internalError<SelectClient>('Failed to update client');
    }

    await ClientUpdated.dispatch(
      {
        client_id: updatedRecord.id,
        changes: Object.fromEntries(Object.keys(data).map((k) => [k, true])),
      },
      {
        actorId: ctx.userId,
        organizationId: ctx.organizationId,
        tx,
      }
    );

    return result.ok(updatedRecord);
  });

  if (!updated.success) {
    return updated;
  }

  const stripeSyncPayload =
    updated.data.stripe_customer_id && (data.email !== undefined || data.name !== undefined || data.phone !== undefined)
      ? {
          customerId: updated.data.stripe_customer_id,
          email: data.email,
          name: data.name,
          phone: data.phone,
        }
      : undefined;

  if (stripeSyncPayload) {
    try {
      await clientsStripeService.updateCustomer(stripeSyncPayload, ctx);
    } catch (err) {
      logger.error('Failed to sync Stripe customer update for client {clientId}: {error}', {
        clientId: updated.data.id,
        stripeCustomerId: stripeSyncPayload.customerId,
        changedFields: Object.keys(stripeSyncPayload).filter((k) => k !== 'customerId'),
        error: err,
      });
    }
  }

  return updated;
};

/**
 * Delete a client (soft delete)
 */
const deleteClient = async (params: { id: string }, ctx: ServiceContext): Promise<Result<void>> => {
  if (ctx.ability.cannot('delete', 'Client')) {
    return result.forbidden('You do not have permission to delete clients');
  }

  const { id } = params;

  const detail = await clientsRepository.findById(id);
  if (!detail || detail.organization_id !== ctx.organizationId) {
    return result.notFound('Client not found');
  }

  if (ctx.ability.cannot('delete', toSubject('Client', detail))) {
    return result.forbidden('You do not have permission to delete this client');
  }

  await clientsRepository.softDelete(id, ctx.userId);
  void ClientDeleted.dispatch({ client_id: id }, { actorId: ctx.userId, organizationId: ctx.organizationId });
  return result.ok(undefined);
};

export const clientsMutationService = {
  updateClient,
  deleteClient,
};
