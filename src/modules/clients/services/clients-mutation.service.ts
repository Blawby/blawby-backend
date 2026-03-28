/**
 * Client Mutation Service
 *
 * Handles write operations for clients (update, delete)
 */

import { ForbiddenError } from '@casl/ability';
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
import type { ServiceContext } from '@/shared/types/service-context';

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
): Promise<SelectClient> => {
  const { id, data } = params;
  let stripeSyncPayload:
    | {
        customerId: string;
        email?: string;
        name?: string;
        phone?: string;
      }
    | undefined = undefined;

  const updated = await db.transaction(async (tx) => {
    const detailWithUser = await clientsRepository.findById(id);
    if (!detailWithUser || detailWithUser.organization_id !== ctx.organizationId) {
      throw new Error('Client not found');
    }

    ForbiddenError.from(ctx.ability).throwUnlessCan('update', toSubject('Client', detailWithUser));

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

      if (detailWithUser.user_id && (data.name !== undefined || data.email !== undefined || data.phone !== undefined)) {
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
          await usersRepository.update(detailWithUser.user_id, userUpdatePayload, tx);
        }
      }

      if (detailWithUser.stripe_customer_id) {
        stripeSyncPayload = {
          customerId: detailWithUser.stripe_customer_id,
          email: data.email,
          name: data.name,
          phone: data.phone,
        };
      }
    }

    let addressId = detailWithUser.address_id;
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
        addressId: detailWithUser.address_id,
        type: 'client',
      });
      addressId = address?.id ?? addressId;
    }

    const finalUpdatePayload: Partial<typeof clients.$inferInsert> = {
      address_id: addressId,
    };
    if (data.status !== undefined) {
      finalUpdatePayload.status = data.status;
    }
    if (data.currency !== undefined) {
      finalUpdatePayload.currency = data.currency;
    }

    const [updatedRecord] = await tx.update(clients).set(finalUpdatePayload).where(eq(clients.id, id)).returning();

    if (!updatedRecord) {
      throw new Error('Failed to update client');
    }

    void ClientUpdated.dispatch(
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

    return updatedRecord;
  });

  if (stripeSyncPayload) {
    try {
      await clientsStripeService.updateCustomer(stripeSyncPayload, ctx);
    } catch {
      // Stripe sync failed but DB update succeeded
      // Return the updated record - caller can check if needed
    }
  }

  return updated;
};

/**
 * Delete a client (soft delete)
 */
const deleteClient = async (params: { id: string }, ctx: ServiceContext): Promise<void> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', 'Client');

  const { id } = params;

  const detail = await clientsRepository.findById(id);
  if (!detail || detail.organization_id !== ctx.organizationId) {
    throw new Error('Client not found');
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', toSubject('Client', detail));

  await clientsRepository.softDelete(id, ctx.userId);
  void ClientDeleted.dispatch({ client_id: id }, { actorId: ctx.userId, organizationId: ctx.organizationId });
};

export const clientsMutationService = {
  updateClient,
  deleteClient,
};
