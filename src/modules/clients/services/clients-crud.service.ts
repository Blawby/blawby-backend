import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { and, eq, isNull } from 'drizzle-orm';
import { clientsStripeService } from './clients-stripe.service';
import { resolveUserForIntake } from './clients-utils';
import { upsertAddressTx } from '@/modules/practice/database/queries/address.repository';
import type { Address } from '@/modules/practice/database/schema/addresses.schema';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import { clients, type SelectClient } from '@/modules/clients/database/schema/clients.schema';
import type { AddressInput } from '@/modules/clients/types';
import type { users } from '@/schema/better-auth-schema';
import { toSubject } from '@/shared/auth/subject-helpers';
import { db } from '@/shared/database';
import { ClientCreated, ClientUpdated, ClientDeleted } from '@/shared/events/definitions';
import { membersRepository } from '@/shared/repositories/members.repository';
import usersRepository from '@/shared/repositories/users.repository';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { ok, internalError, notFound, forbidden, type AcceptedResponse } from '@/shared/utils/result';

const logger = getLogger(['clients', 'crud-service']);

const createClient = async (
  params: {
    data: {
      name: string;
      email: string;
      phone?: string;
      address?: AddressInput;
      status?: string;
      currency?: string;
    };
  },
  ctx: ServiceContext
): Promise<
  Result<
    | (SelectClient & {
        user: typeof users.$inferSelect | null;
      })
    | AcceptedResponse
  >
> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Client');

  const { data } = params;
  try {
    const user = await usersRepository.findByEmail(data.email);
    if (!user) {
      return notFound('User not found. Please invite them using the invitations flow first.');
    }

    const existingMember = await membersRepository.findByOrgAndUser({
      organizationId: ctx.organizationId,
      userId: user.id,
    });
    if (!existingMember) {
      await membersRepository.create({
        organizationId: ctx.organizationId,
        userId: user.id,
        role: 'client',
      });
    }

    const txResult = await db.transaction(async (tx) => {
      try {
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

        const [detail] = await tx
          .insert(clients)
          .values({
            organization_id: ctx.organizationId,
            user_id: user.id,
            name: data.name,
            email: data.email,
            stripe_customer_id: null,
            address_id: addressId,
            status: data.status ?? 'lead',
            currency: data.currency ?? 'usd',
          })
          .returning();

        return ok({ ...detail, user });
      } catch (error) {
        logger.error('Failed to create client: {error}', {
          error,
          organizationId: ctx.organizationId,
        });
        return internalError('Failed to create client');
      }
    });

    if (txResult.success) {
      const createdDetail = txResult.data;
      void ClientCreated.dispatch(
        {
          client_id: createdDetail.id,
          user_id: user.id,
          name: user.name,
          email: user.email,
          stripe_customer_id: createdDetail.stripe_customer_id ?? undefined,
        },
        { actorId: ctx.userId, organizationId: ctx.organizationId }
      );
    }

    return txResult;
  } catch (error) {
    logger.error('Failed to create client: {error}', {
      error,
      organizationId: ctx.organizationId,
    });
    return internalError('Failed to create client');
  }
};

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
): Promise<Result<SelectClient, { stripeSyncFailed?: boolean }>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Client');
  const { id, data } = params;
  interface StripeSyncPayload {
    customerId: string;
    email?: string;
    name?: string;
    phone?: string;
  }

  const txResult = await db.transaction(async (tx) => {
    try {
      let stripeSyncPayload: StripeSyncPayload | undefined = undefined;
      const detailWithUser = await clientsRepository.findById(id);
      if (!detailWithUser || detailWithUser.organization_id !== ctx.organizationId) {
        return notFound('Client not found');
      }

      ForbiddenError.from(ctx.ability).throwUnlessCan('update', toSubject('Client', detailWithUser));

      if (data.name || data.email || data.phone) {
        // Update clients table fields directly
        const updatePayload: Partial<typeof clients.$inferInsert> = {};
        if (data.name) { updatePayload.name = data.name; }
        if (data.email) { updatePayload.email = data.email; }

        if (Object.keys(updatePayload).length > 0) {
          await tx.update(clients).set(updatePayload).where(eq(clients.id, id));
        }

        // Also update user record if linked
        if (detailWithUser.user_id && (data.name || data.email || data.phone)) {
          await usersRepository.update(
            detailWithUser.user_id,
            {
              name: data.name,
              email: data.email?.toLowerCase(),
              phone: data.phone,
            },
            tx
          );
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

      const updated = await clientsRepository.update(
        id,
        {
          address_id: addressId,
          status: data.status,
          currency: data.currency,
        },
        tx
      );
      if (!updated) {
        return internalError('Failed to update client');
      }

      await ClientUpdated.dispatch(
        {
          client_id: updated.id,
          changes: Object.fromEntries(Object.keys(data).map((k) => [k, true])),
        },
        {
          actorId: ctx.userId,
          organizationId: ctx.organizationId,
          tx,
        }
      );

      return ok({ updated, stripeSyncPayload });
    } catch (error) {
      logger.error('Failed to update client {id}: {error}', { id, error });
      return internalError('Failed to update client');
    }
  });

  if (!txResult.success) {
    return txResult;
  }

  const { updated, stripeSyncPayload } = txResult.data;

  if (stripeSyncPayload) {
    try {
      await clientsStripeService.updateCustomer(stripeSyncPayload, ctx);
    } catch (error) {
      logger.error('Failed to sync client to Stripe for client {client_id}: {error}', {
        client_id: id,
        customer_id: stripeSyncPayload.customerId,
        error,
      });
      // Return success with metadata indicating Stripe sync failed
      // The DB transaction succeeded, so we don't want to roll that back
      return {
        success: true,
        data: updated,
        metadata: { stripeSyncFailed: true },
      };
    }
  }

  return ok(updated);
};

const listClients = async (
  params: {
    clientId?: string;
    search?: string;
    status?: string;
    limit?: number;
    offset?: number;
  },
  ctx: ServiceContext
): Promise<
  Result<{
    data: (SelectClient & {
      user: typeof users.$inferSelect | null;
      address: Address | null;
    })[];
    total: number;
  }>
> => {
  if (ctx.ability.can('read', 'Client')) {
    // Admin/Member can list all or filter by clientId
  } else if (ctx.ability.can('read', toSubject('Client', { user_id: ctx.userId }))) {
    // Client can ONLY see their own record
  } else {
    return forbidden('You do not have permission to view clients');
  }

  const effectiveClientId = ctx.ability.can('read', toSubject('Client', { user_id: ctx.userId }))
    ? ctx.userId
    : params.clientId;

  try {
    const data = await clientsRepository.listClients({
      ...params,
      clientId: effectiveClientId,
      organizationId: ctx.organizationId,
    });
    return ok(data);
  } catch (error) {
    logger.error('Failed to list clients: {error}', {
      error,
      organizationId: ctx.organizationId,
    });
    return internalError('Failed to list clients');
  }
};

const getClient = async (params: { id: string }, ctx: ServiceContext): Promise<Result<SelectClient>> => {
  const { id } = params;
  try {
    const detail = await clientsRepository.findById(id);
    if (!detail || detail.organization_id !== ctx.organizationId) {
      return notFound('Client not found');
    }

    ForbiddenError.from(ctx.ability).throwUnlessCan('read', toSubject('Client', detail));

    return ok(detail);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return forbidden('You do not have permission to view client');
    }

    logger.error('Failed to get client {id}: {error}', { id, error });
    return internalError('Failed to get client');
  }
};

const deleteClient = async (params: { id: string }, ctx: ServiceContext): Promise<Result<void>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', 'Client');
  const { id } = params;
  try {
    const detail = await clientsRepository.findById(id);
    if (!detail || detail.organization_id !== ctx.organizationId) {
      return notFound('Client not found');
    }

    ForbiddenError.from(ctx.ability).throwUnlessCan('delete', toSubject('Client', detail));

    await clientsRepository.softDelete(id, ctx.userId);
    void ClientDeleted.dispatch(
      { client_id: id },
      { actorId: ctx.userId, organizationId: ctx.organizationId }
    );

    return ok(undefined);
  } catch (error) {
    logger.error('Failed to delete client {id}: {error}', { id, error });
    return internalError('Failed to delete client');
  }
};

const ensureClientSetup = async (
  params: { id: string },
  ctx: ServiceContext
): Promise<
  Result<
    SelectClient & {
      user: typeof users.$inferSelect | null;
    }
  >
> => {
  const { id } = params;
  try {
    const detail = await clientsRepository.findById(id);
    if (!detail || detail.organization_id !== ctx.organizationId) {
      return notFound('Client details not found');
    }

    let didBackfillStripeCustomerId = false;

    if (!detail.stripe_customer_id) {
      // For lazy customer creation, we use the client's stored email/name
      if (!detail.email || !detail.name) {
        return notFound('Client is missing email or name for Stripe customer creation');
      }

      const stripeCustomerId = await clientsStripeService.createCustomer(
        {
          email: detail.email,
          name: detail.name,
          metadata: {
            organization_id: ctx.organizationId,
            source: 'auto_vivification_sync',
          },
        },
        ctx
      );

      if (stripeCustomerId) {
        await clientsRepository.update(id, {
          stripe_customer_id: stripeCustomerId,
        });
        detail.stripe_customer_id = stripeCustomerId;
        didBackfillStripeCustomerId = true;
      }
    }

    if (didBackfillStripeCustomerId) {
      void ClientUpdated.dispatch(
        {
          client_id: detail.id,
          changes: { stripe_customer_id: true },
        },
        { actorId: ctx.userId, organizationId: ctx.organizationId }
      );
    }

    const user = detail.user_id ? (await usersRepository.findById(detail.user_id)) ?? null : null;
    return ok({ ...detail, user });
  } catch (error) {
    logger.error('Failed to ensure client setup for {id}: {error}', { id, error });
    return internalError('Failed to complete client setup');
  }
};

const createClientFromIntake = async (
  params: {
    data: {
      intakeId: string;
      userId?: string;
      email: string;
      name: string;
      phone?: string;
      metadata?: Record<string, unknown>;
    };
  },
  ctx: ServiceContext
): Promise<Result<SelectClient>> => {
  const { intakeId, userId, email, name, phone } = params.data;
  try {
    const intake = await practiceClientIntakesRepository.findById(intakeId);
    if (!intake) {
      return notFound(`Intake record with ID '${intakeId}' not found`);
    }

    const user = await resolveUserForIntake({
      userId,
      email,
      name,
      phone,
    });
    if (!user) {
      return internalError('Unable to process intake.');
    }

    const existingMember = await membersRepository.findByOrgAndUser({
      organizationId: ctx.organizationId,
      userId: user.id,
    });
    if (!existingMember) {
      await membersRepository.create({
        organizationId: ctx.organizationId,
        userId: user.id,
        role: 'client',
      });
    }

    // Check for existing client (read-only query before transaction)
    const [existingDetail] = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.organization_id, ctx.organizationId),
          eq(clients.user_id, user.id),
          isNull(clients.deleted_at)
        )
      )
      .limit(1);
    if (existingDetail) {
      if (!existingDetail.intake_id) {
        const [updatedDetail] = await db
          .update(clients)
          .set({ intake_id: intakeId, status: 'active', updated_at: new Date() })
          .where(eq(clients.id, existingDetail.id))
          .returning();
        void ClientUpdated.dispatch(
          {
            client_id: updatedDetail.id,
            changes: { intake_id: true, status: true },
          },
          { actorId: 'system', actorType: 'system', organizationId: ctx.organizationId }
        );
        return ok(updatedDetail);
      }
      return ok(existingDetail);
    }



    // Transaction only for database operations
    const txResult = await db.transaction(async (tx) => {
      const [detail] = await tx
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

      return ok(detail);
    });

    if (!txResult.success) {
      return internalError('Failed to create client from intake');
    }

    const detail = txResult.data;

    // Event dispatch happens AFTER transaction completes
    void ClientCreated.dispatch(
      {
        client_id: detail.id,
        user_id: user.id,
        name: user.name,
        email: user.email,
        stripe_customer_id: detail.stripe_customer_id ?? undefined,
      },
      { actorId: 'system', actorType: 'system', organizationId: ctx.organizationId }
    );

    return ok(detail);
  } catch (error) {
    logger.error('Failed to create client from intake {intakeId}: {error}', { intakeId, error });
    return internalError('Failed to create client from intake');
  }
};

export const clientsCrudService = {
  createClient,
  updateClient,
  listClients,
  getClient,
  deleteClient,
  createClientFromIntake,
  ensureClientSetup,
};

// Compatibility export
export const clientsService = clientsCrudService;
