import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import { clients, type SelectClient } from '@/modules/clients/database/schema/clients.schema';
import { clientsStripeService } from '@/modules/clients/services/clients-stripe.service';
import { resolveUserForIntake } from '@/modules/clients/services/clients-utils';
import type { AddressInput } from '@/modules/clients/types';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { upsertAddress } from '@/modules/practice/database/queries/address.repository';
import type { Address } from '@/modules/practice/database/schema/addresses.schema';
import type { users } from '@/schema/better-auth-schema';
import { toSubject } from '@/shared/auth/subject-helpers';
import { getActiveTx, uow } from '@/shared/database/uow';
import { ClientCreated, ClientDeleted, ClientUpdated } from '@/shared/events/definitions';
import { membersRepository } from '@/shared/repositories/members.repository';
import usersRepository from '@/shared/repositories/users.repository';
import type { ServiceContext } from '@/shared/types/service-context';
import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

const logger = getLogger(['clients', 'crud-service']);

interface StripeSyncPayload {
  customerId: string;
  email?: string;
  name?: string;
  phone?: string;
}

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
  SelectClient & {
    user: typeof users.$inferSelect | null;
  }
> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Client');

  const { data } = params;
  try {
    const user = await usersRepository.findByEmail(data.email);
    if (!user) {
      throw new HTTPException(404, { message: 'User not found. Please invite them using the invitations flow first.' });
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

    const createdDetail = await uow.transaction(async () => {
      let addressId: string | undefined = undefined;
      if (data.address) {
        const address = await upsertAddress({
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

      const detail = await clientsRepository.create({
        organization_id: ctx.organizationId,
        user_id: user.id,
        name: data.name,
        email: data.email,
        stripe_customer_id: null,
        address_id: addressId,
        status: data.status ?? 'lead',
        currency: data.currency ?? 'usd',
      });

      return { ...detail, user };
    });

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

    return createdDetail;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to create client: {error}', {
      error,
      organizationId: ctx.organizationId,
    });
    throw new HTTPException(500, { message: 'Failed to create client' });
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
): Promise<SelectClient> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Client');
  const { id, data } = params;

  let stripeSyncPayload: StripeSyncPayload | undefined = undefined;

  const updated = await uow.transaction(async (): Promise<SelectClient> => {
    try {
      const detailWithUser = await clientsRepository.findById(id);
      if (!detailWithUser || detailWithUser.organization_id !== ctx.organizationId) {
        throw new HTTPException(404, { message: 'Client not found' });
      }

      ForbiddenError.from(ctx.ability).throwUnlessCan('update', toSubject('Client', detailWithUser));

      if (data.name || data.email || data.phone) {
        // Update clients table fields directly
        const updatePayload: Partial<typeof clients.$inferInsert> = {};
        if (data.name) {
          updatePayload.name = data.name;
        }
        if (data.email) {
          updatePayload.email = data.email;
        }

        if (Object.keys(updatePayload).length > 0) {
          await getActiveTx().update(clients).set(updatePayload).where(eq(clients.id, id));
        }

        // Also update user record if linked
        if (detailWithUser.user_id && (data.name || data.email || data.phone)) {
          await usersRepository.update(detailWithUser.user_id, {
            name: data.name,
            email: data.email?.toLowerCase(),
            phone: data.phone,
          });
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
        const address = await upsertAddress({
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

      const updatedResult = await clientsRepository.update(id, {
        address_id: addressId,
        status: data.status,
        currency: data.currency,
      });
      if (!updatedResult) {
        throw new HTTPException(500, { message: 'Failed to update client' });
      }

      void ClientUpdated.dispatch(
        {
          client_id: updatedResult.id,
          changes: Object.fromEntries(Object.keys(data).map((k) => [k, true])),
        },
        {
          actorId: ctx.userId,
          organizationId: ctx.organizationId,
          tx: getActiveTx(),
        }
      );

      return updatedResult;
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      logger.error('Failed to update client {id}: {error}', { id, error });
      throw new HTTPException(500, { message: 'Failed to update client' });
    }
  });

  // Stripe sync happens AFTER transaction commits (best-effort)
  if (stripeSyncPayload) {
    const { customerId } = stripeSyncPayload;
    try {
      await clientsStripeService.updateCustomer(stripeSyncPayload, ctx);
    } catch (error) {
      logger.error('Failed to sync client to Stripe for client {client_id}: {error}', {
        client_id: id,
        customer_id: customerId,
        error,
      });
      // Don't throw - DB transaction succeeded, just log the Stripe sync failure
    }
  }

  return updated;
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
): Promise<{
  data: (SelectClient & {
    user: typeof users.$inferSelect | null;
    address: Address | null;
  })[];
  total: number;
}> => {
  let effectiveClientId: string | undefined = params.clientId;

  if (ctx.ability.can('read', 'Client')) {
    // Admin/Member can list all or filter by clientId
  } else if (
    !ctx.ability.can('read', 'Client') &&
    ctx.ability.can('read', toSubject('Client', { user_id: ctx.userId }))
  ) {
    // Client can ONLY see their own record (restricted to own record)
    effectiveClientId = ctx.userId;
  } else {
    throw new HTTPException(403, { message: 'You do not have permission to view clients' });
  }

  try {
    const data = await clientsRepository.listClients({
      ...params,
      clientId: effectiveClientId,
      organizationId: ctx.organizationId,
    });
    return data;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to list clients: {error}', {
      error,
      organizationId: ctx.organizationId,
    });
    throw new HTTPException(500, { message: 'Failed to list clients' });
  }
};

const getClient = async (params: { id: string }, ctx: ServiceContext): Promise<SelectClient> => {
  const { id } = params;
  try {
    const detail = await clientsRepository.findById(id);
    if (!detail || detail.organization_id !== ctx.organizationId) {
      throw new HTTPException(404, { message: 'Client not found' });
    }

    ForbiddenError.from(ctx.ability).throwUnlessCan('read', toSubject('Client', detail));

    return detail;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to get client {id}: {error}', { id, error });
    throw new HTTPException(500, { message: 'Failed to get client' });
  }
};

const deleteClient = async (params: { id: string }, ctx: ServiceContext): Promise<void> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', 'Client');
  const { id } = params;
  try {
    const detail = await clientsRepository.findById(id);
    if (!detail || detail.organization_id !== ctx.organizationId) {
      throw new HTTPException(404, { message: 'Client not found' });
    }

    ForbiddenError.from(ctx.ability).throwUnlessCan('delete', toSubject('Client', detail));

    await clientsRepository.softDelete(id, ctx.userId);
    void ClientDeleted.dispatch({ client_id: id }, { actorId: ctx.userId, organizationId: ctx.organizationId });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to delete client {id}: {error}', { id, error });
    throw new HTTPException(500, { message: 'Failed to delete client' });
  }
};

const ensureClientSetup = async (
  params: { id: string },
  ctx: ServiceContext
): Promise<SelectClient & { user: typeof users.$inferSelect | null }> => {
  const { id } = params;

  // Enforce CASL permission check before any client updates
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Client');

  try {
    const detail = await clientsRepository.findById(id);
    if (!detail || detail.organization_id !== ctx.organizationId) {
      throw new HTTPException(404, { message: 'Client details not found' });
    }

    let didBackfillStripeCustomerId = false;

    if (!detail.stripe_customer_id) {
      // For lazy customer creation, we use the client's stored email/name
      if (!detail.email || !detail.name) {
        throw new HTTPException(400, { message: 'Client is missing email or name for Stripe customer creation' });
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
        const updatedDetail = await clientsRepository.update(id, {
          stripe_customer_id: stripeCustomerId,
        });
        if (updatedDetail) {
          detail.stripe_customer_id = updatedDetail.stripe_customer_id;
        }
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

    const user = detail.user_id ? ((await usersRepository.findById(detail.user_id)) ?? null) : null;
    return { ...detail, user };
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to ensure client setup for {id}: {error}', { id, error });
    throw new HTTPException(500, { message: 'Failed to complete client setup' });
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
): Promise<SelectClient> => {
  const { intakeId, userId, email, name, phone } = params.data;

  const isClientDuplicateRace = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const dbError = error as { code?: string; table?: string; constraint?: string };
    if (dbError.code !== '23505') {
      return false;
    }

    return dbError.table === 'clients' || Boolean(dbError.constraint?.toLowerCase().includes('clients'));
  };

  try {
    const intake = await practiceClientIntakesRepository.findById(intakeId);
    if (!intake) {
      throw new HTTPException(404, { message: `Intake record with ID '${intakeId}' not found` });
    }

    const user = await resolveUserForIntake({
      userId,
      email,
      name,
      phone,
    });
    if (!user) {
      throw new HTTPException(500, { message: 'Unable to process intake.' });
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
    const existingDetail = await clientsRepository.findByOrgAndUser(ctx.organizationId, user.id);
    if (existingDetail) {
      if (!existingDetail.intake_id) {
        const updatedDetail = await clientsRepository.updateIntakeIfNull(existingDetail.id, intakeId);
        if (!updatedDetail) {
          const currentDetail = await clientsRepository.findById(existingDetail.id);
          if (!currentDetail) {
            throw new HTTPException(404, { message: 'Client not found' });
          }
          if (currentDetail.intake_id === intakeId) {
            return currentDetail;
          }
          throw new HTTPException(409, { message: `Client already linked for intake '${currentDetail.intake_id}'` });
        }
        void ClientUpdated.dispatch(
          {
            client_id: updatedDetail.id,
            changes: { intake_id: true, status: true },
          },
          { actorId: 'system', actorType: 'system', organizationId: ctx.organizationId }
        );
        return updatedDetail;
      }
      return existingDetail;
    }

    // Transaction only for database operations
    const detail = await uow.transaction(async () =>
      clientsRepository.create({
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
    );

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

    return detail;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    if (isClientDuplicateRace(error)) {
      throw new HTTPException(409, {
        message: `Client already linked for intake '${intakeId}'`,
      });
    }

    logger.error('Failed to create client from intake {intakeId}: {error}', { intakeId, error });
    throw new HTTPException(500, { message: 'Failed to create client from intake' });
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
