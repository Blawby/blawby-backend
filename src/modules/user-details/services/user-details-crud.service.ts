import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { and, eq, isNull } from 'drizzle-orm';
import { userDetailsStripeService } from './user-details-stripe.service';
import { resolveUserForIntake } from './user-details-utils';
import { upsertAddressTx } from '@/modules/practice/database/queries/address.repository';
import type { Address } from '@/modules/practice/database/schema/addresses.schema';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { userDetailsRepository } from '@/modules/user-details/database/queries/user-details.queries';
import { userDetails, type SelectUserDetail } from '@/modules/user-details/database/schema/user-details.schema';
import type { AddressInput } from '@/modules/user-details/types';
import type { users } from '@/schema/better-auth-schema';
import { toSubject } from '@/shared/auth/subject-helpers';
import { db } from '@/shared/database';
import { UserDetailsCreated, UserDetailsUpdated, UserDetailsDeleted } from '@/shared/events/definitions';
import { membersRepository } from '@/shared/repositories/members.repository';
import usersRepository from '@/shared/repositories/users.repository';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { ok, internalError, notFound, forbidden, type AcceptedResponse } from '@/shared/utils/result';

const logger = getLogger(['user-details', 'crud-service']);

const createUserDetails = async (
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
    | (SelectUserDetail & {
        user: typeof users.$inferSelect;
      })
    | AcceptedResponse
  >
> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'UserDetails');

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

    // External call intentionally happens before transaction to avoid holding DB locks.
    const stripeCustomerId = await userDetailsStripeService.createCustomer(
      {
        email: user.email,
        name: user.name,
        phone: user.phone ?? undefined,
        metadata: {
          organization_id: ctx.organizationId,
          source: 'blawby_clients_api',
        },
      },
      ctx
    );

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
          .insert(userDetails)
          .values({
            organization_id: ctx.organizationId,
            user_id: user.id,
            stripe_customer_id: stripeCustomerId,
            address_id: addressId,
            status: data.status ?? 'lead',
            currency: data.currency ?? 'usd',
          })
          .returning();

        return ok({ ...detail, user });
      } catch (error) {
        logger.error('Failed to create user details: {error}', {
          error,
          organizationId: ctx.organizationId,
        });
        return internalError('Failed to create user details');
      }
    });

    if (txResult.success) {
      const createdDetail = txResult.data;
      void UserDetailsCreated.dispatch(
        {
          user_detail_id: createdDetail.id,
          user_id: createdDetail.user.id,
          name: createdDetail.user.name,
          email: createdDetail.user.email,
          stripe_customer_id: createdDetail.stripe_customer_id ?? undefined,
        },
        { actorId: ctx.userId, organizationId: ctx.organizationId }
      );
    }

    return txResult;
  } catch (error) {
    logger.error('Failed to create user details: {error}', {
      error,
      organizationId: ctx.organizationId,
    });
    return internalError('Failed to create user details');
  }
};

const updateUserDetails = async (
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
): Promise<Result<SelectUserDetail, { stripeSyncFailed?: boolean }>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'UserDetails');
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
      const detailWithUser = await userDetailsRepository.findById(id);
      if (!detailWithUser || detailWithUser.organization_id !== ctx.organizationId) {
        return notFound('User detail not found');
      }

      ForbiddenError.from(ctx.ability).throwUnlessCan('update', toSubject('UserDetails', detailWithUser));

      if (data.name || data.email || data.phone) {
        await usersRepository.update(
          detailWithUser.user_id,
          {
            name: data.name,
            email: data.email?.toLowerCase(),
            phone: data.phone,
          },
          tx
        );

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
            country: data.address.country,
          },
          organizationId: ctx.organizationId,
          addressId: detailWithUser.address_id,
          type: 'client',
        });
        addressId = address?.id ?? addressId;
      }

      const updated = await userDetailsRepository.update(
        id,
        {
          address_id: addressId,
          status: data.status,
          currency: data.currency,
        },
        tx
      );
      if (!updated) {
        return internalError('Failed to update user details');
      }

      await UserDetailsUpdated.dispatch(
        {
          user_detail_id: updated.id,
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
      logger.error('Failed to update user details {id}: {error}', { id, error });
      return internalError('Failed to update user details');
    }
  });

  if (!txResult.success) {
    return txResult;
  }

  const { updated, stripeSyncPayload } = txResult.data;

  if (stripeSyncPayload) {
    try {
      await userDetailsStripeService.updateCustomer(stripeSyncPayload, ctx);
    } catch (error) {
      logger.error('Failed to sync user details to Stripe for user {user_id}: {error}', {
        user_id: ctx.userId,
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

const listUserDetails = async (
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
    data: (SelectUserDetail & {
      user: typeof users.$inferSelect;
      address: Address | null;
    })[];
    total: number;
  }>
> => {
  if (ctx.ability.can('read', 'UserDetails')) {
    // Admin/Member can list all or filter by clientId
  } else if (ctx.ability.can('read', toSubject('UserDetails', { user_id: ctx.userId }))) {
    // Client can ONLY see their own record
    params.clientId = ctx.userId;
  } else {
    return forbidden('You do not have permission to view user details');
  }

  try {
    const data = await userDetailsRepository.listClients({
      ...params,
      organizationId: ctx.organizationId,
    });
    return ok(data);
  } catch (error) {
    logger.error('Failed to list user details: {error}', {
      error,
      organizationId: ctx.organizationId,
    });
    return internalError('Failed to list user details');
  }
};

const getUserDetail = async (params: { id: string }, ctx: ServiceContext): Promise<Result<SelectUserDetail>> => {
  const { id } = params;
  try {
    const detail = await userDetailsRepository.findById(id);
    if (!detail || detail.organization_id !== ctx.organizationId) {
      return notFound('User detail not found');
    }

    ForbiddenError.from(ctx.ability).throwUnlessCan('read', toSubject('UserDetails', detail));

    return ok(detail);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return forbidden('You do not have permission to view user details');
    }

    logger.error('Failed to get user detail {id}: {error}', { id, error });
    return internalError('Failed to get user detail');
  }
};

const deleteUserDetail = async (params: { id: string }, ctx: ServiceContext): Promise<Result<void>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', 'UserDetails');
  const { id } = params;
  try {
    const detail = await userDetailsRepository.findById(id);
    if (!detail || detail.organization_id !== ctx.organizationId) {
      return notFound('User detail not found');
    }

    ForbiddenError.from(ctx.ability).throwUnlessCan('delete', toSubject('UserDetails', detail));

    await userDetailsRepository.softDelete(id, ctx.userId);
    void UserDetailsDeleted.dispatch(
      { user_detail_id: id },
      { actorId: ctx.userId, organizationId: ctx.organizationId }
    );

    return ok(undefined);
  } catch (error) {
    logger.error('Failed to delete user detail {id}: {error}', { id, error });
    return internalError('Failed to delete user detail');
  }
};

const ensureClientSetup = async (
  params: { id: string },
  ctx: ServiceContext
): Promise<
  Result<
    SelectUserDetail & {
      user: typeof users.$inferSelect;
    }
  >
> => {
  const { id } = params;
  try {
    const detail = await userDetailsRepository.findById(id);
    if (!detail || detail.organization_id !== ctx.organizationId) {
      return notFound('Client details not found');
    }

    const user = await usersRepository.findById(detail.user_id);
    if (!user) {
      return notFound('User not found');
    }

    let didBackfillStripeCustomerId = false;

    if (!detail.stripe_customer_id) {
      const stripeCustomerId = await userDetailsStripeService.createCustomer(
        {
          email: user.email,
          name: user.name,
          phone: user.phone ?? undefined,
          metadata: {
            organization_id: ctx.organizationId,
            source: 'auto_vivification_sync',
          },
        },
        ctx
      );

      if (stripeCustomerId) {
        await userDetailsRepository.update(id, {
          stripe_customer_id: stripeCustomerId,
        });
        detail.stripe_customer_id = stripeCustomerId;
        didBackfillStripeCustomerId = true;
      }
    }

    if (didBackfillStripeCustomerId) {
      void UserDetailsUpdated.dispatch(
        {
          user_detail_id: detail.id,
          changes: { stripe_customer_id: true },
        },
        { actorId: ctx.userId, organizationId: ctx.organizationId }
      );
    }

    return ok({ ...detail, user });
  } catch (error) {
    logger.error('Failed to ensure client setup for {id}: {error}', { id, error });
    return internalError('Failed to complete client setup');
  }
};

const createUserDetailsFromIntake = async (
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
): Promise<Result<SelectUserDetail>> => {
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

    // Check for existing detail (read-only query before transaction)
    const [existingDetail] = await db
      .select()
      .from(userDetails)
      .where(
        and(
          eq(userDetails.organization_id, ctx.organizationId),
          eq(userDetails.user_id, user.id),
          isNull(userDetails.deleted_at)
        )
      )
      .limit(1);
    if (existingDetail) {
      if (!existingDetail.intake_id) {
        const [updatedDetail] = await db
          .update(userDetails)
          .set({ intake_id: intakeId, status: 'active', updated_at: new Date() })
          .where(eq(userDetails.id, existingDetail.id))
          .returning();
        void UserDetailsUpdated.dispatch(
          {
            user_detail_id: updatedDetail.id,
            changes: { intake_id: true, status: true },
          },
          { actorId: 'system', actorType: 'system', organizationId: ctx.organizationId }
        );
        return ok(updatedDetail);
      }
      return ok(existingDetail);
    }

    // External call happens BEFORE transaction to avoid holding DB locks
    const stripeCustomerId = await userDetailsStripeService.createCustomer(
      {
        email: user.email,
        name: user.name,
        phone: user.phone ?? undefined,
        metadata: { organization_id: ctx.organizationId, intake_id: intakeId, source: 'blawby_intake' },
      },
      ctx
    );

    // Transaction only for database operations
    const txResult = await db.transaction(async (tx) => {
      const [detail] = await tx
        .insert(userDetails)
        .values({
          organization_id: ctx.organizationId,
          user_id: user.id,
          intake_id: intakeId,
          address_id: intake.address_id ?? undefined,
          stripe_customer_id: stripeCustomerId,
          status: 'active',
          event_name: 'client_intake_success',
        })
        .returning();

      return ok(detail);
    });

    if (!txResult.success) {
      return internalError('Failed to create user details from intake');
    }

    const detail = txResult.data;

    // Event dispatch happens AFTER transaction completes
    void UserDetailsCreated.dispatch(
      {
        user_detail_id: detail.id,
        user_id: user.id,
        name: user.name,
        email: user.email,
        stripe_customer_id: detail.stripe_customer_id ?? undefined,
      },
      { actorId: 'system', actorType: 'system', organizationId: ctx.organizationId }
    );

    return ok(detail);
  } catch (error) {
    logger.error('Failed to create user details from intake {intakeId}: {error}', { intakeId, error });
    return internalError('Failed to create user details from intake');
  }
};

export const userDetailsCrudService = {
  createUserDetails,
  updateUserDetails,
  listUserDetails,
  getUserDetail,
  deleteUserDetail,
  createUserDetailsFromIntake,
  ensureClientSetup,
};

// Compatibility export
export const userDetailsService = userDetailsCrudService;
