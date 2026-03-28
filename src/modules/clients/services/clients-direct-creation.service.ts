/**
 * Client Direct Creation Service
 *
 * Handles staff-initiated client creation
 */

import { sql } from 'drizzle-orm';
import { upsertAddressTx } from '@/modules/practice/database/queries/address.repository';
import { clients, type SelectClient } from '@/modules/clients/database/schema/clients.schema';
import type { AddressInput } from '@/modules/clients/types';
import { db } from '@/shared/database';
import { ClientCreated } from '@/shared/events/definitions';
import { usersRepository, type SelectUser } from '@/shared/repositories/users.repository';
import type { ServiceContext } from '@/shared/types/service-context';
import { ensureClientMember } from '@/modules/clients/services/clients-creation.helpers';
import { HTTPException } from 'hono/http-exception';

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
): Promise<SelectClient & { user: SelectUser | null }> => {
  const { data } = params;

  if (ctx.ability.cannot('create', 'Client')) {
    throw new HTTPException(403, { message: 'You do not have permission to create clients' });
  }

  const user = data.userId
    ? await usersRepository.findById(data.userId)
    : await usersRepository.findByEmail(data.email);
  if (!user) {
    throw new HTTPException(400, { message: 'User not found. Please invite them using the invitations flow first.' });
  }

  const { detail } = await db.transaction(async (tx) => {
    await ensureClientMember({
      organizationId: ctx.organizationId,
      userId: user.id,
      tx,
    });

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

    const [upsertedClient] = await tx
      .insert(clients)
      .values({
        organization_id: ctx.organizationId,
        user_id: user.id,
        name: data.name,
        email: data.email.toLowerCase(),
        stripe_customer_id: null,
        address_id: addressId,
        status: data.status,
        currency: data.currency,
      })
      .onConflictDoUpdate({
        target: [clients.organization_id, clients.user_id],
        set: {
          name: data.name,
          email: data.email.toLowerCase(),
          address_id: sql`COALESCE(EXCLUDED.address_id, ${clients.address_id})`,
          ...(data.status ? { status: data.status } : {}),
          ...(data.currency ? { currency: data.currency } : {}),
          updated_at: new Date(),
        },
      })
      .returning();

    const isCreated = upsertedClient.created_at.getTime() === upsertedClient.updated_at.getTime();

    if (isCreated) {
      await ClientCreated.dispatch(
        {
          client_id: upsertedClient.id,
          user_id: user.id,
          name: upsertedClient.name ?? data.name,
          email: upsertedClient.email ?? data.email.toLowerCase(),
          stripe_customer_id: upsertedClient.stripe_customer_id ?? undefined,
        },
        { actorId: ctx.userId, organizationId: ctx.organizationId, tx }
      );
    }

    return { detail: upsertedClient, isCreated };
  });

  return { ...detail, user: user as SelectUser | null };
};

export const clientsDirectCreationService = {
  createClient,
};
