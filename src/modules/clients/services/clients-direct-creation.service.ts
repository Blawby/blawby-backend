/**
 * Client Direct Creation Service
 *
 * Handles staff-initiated client creation
 */

import { and, eq, isNull } from 'drizzle-orm';
import { upsertAddressTx } from '@/modules/practice/database/queries/address.repository';
import { clients, type SelectClient } from '@/modules/clients/database/schema/clients.schema';
import type { AddressInput } from '@/modules/clients/types';
import type { users } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';
import { ClientCreated } from '@/shared/events/definitions';
import usersRepository from '@/shared/repositories/users.repository';
import type { ServiceContext } from '@/shared/types/service-context';
import { ensureClientMember } from '@/modules/clients/services/clients-creation.helpers';

/**
 * Create a new client (staff-initiated)
 */
const createClient = async (
  params: {
    data: {
      userId?: string;
      name: string;
      email: string;
      address?: AddressInput;
      status?: string;
      currency?: string;
    };
  },
  ctx: ServiceContext
): Promise<SelectClient & { user: typeof users.$inferSelect | null }> => {
  const { data } = params;

  const user = data.userId
    ? await usersRepository.findById(data.userId)
    : await usersRepository.findByEmail(data.email);
  if (!user) {
    throw new Error('User not found. Please invite them using the invitations flow first.');
  }

  await ensureClientMember({
    organizationId: ctx.organizationId,
    userId: user.id,
  });

  const { detail, isCreated } = await db.transaction(async (tx) => {
    let addressId: string | undefined = undefined;
    if (data.address) {
      const address = await upsertAddressTx(tx, {
        addressData: {
          line1: data.address.line1,
          line2: data.address.line2,
          city: data.address.city,
          state: data.address.state,
          postal_code: data.address.postal_code,
          country: data.address.country,
        },
        organizationId: ctx.organizationId,
        type: 'client',
      });
      addressId = address?.id;
    }

    const [existingClient] = await tx
      .select()
      .from(clients)
      .where(
        and(eq(clients.organization_id, ctx.organizationId), eq(clients.user_id, user.id), isNull(clients.deleted_at))
      )
      .limit(1);

    if (existingClient) {
      const [updatedExisting] = await tx
        .update(clients)
        .set({
          name: data.name,
          email: data.email.toLowerCase(),
          address_id: addressId ?? existingClient.address_id,
          status: data.status ?? existingClient.status,
          currency: data.currency ?? existingClient.currency,
          updated_at: new Date(),
        })
        .where(eq(clients.id, existingClient.id))
        .returning();

      return { detail: updatedExisting ?? existingClient, isCreated: false };
    }

    const [createdClient] = await tx
      .insert(clients)
      .values({
        organization_id: ctx.organizationId,
        user_id: user.id,
        name: data.name,
        email: data.email.toLowerCase(),
        stripe_customer_id: null,
        address_id: addressId,
        status: data.status ?? 'lead',
        currency: data.currency ?? 'usd',
      })
      .returning();

    return { detail: createdClient, isCreated: true };
  });

  if (isCreated) {
    void ClientCreated.dispatch(
      {
        client_id: detail.id,
        user_id: user.id,
        name: detail.name ?? data.name,
        email: detail.email ?? data.email.toLowerCase(),
        stripe_customer_id: detail.stripe_customer_id ?? undefined,
      },
      { actorId: ctx.userId, organizationId: ctx.organizationId }
    );
  }

  return { ...detail, user };
};

export const clientsDirectCreationService = {
  createClient,
};
