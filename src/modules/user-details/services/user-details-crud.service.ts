import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';

import { userDetailsStripeService } from './user-details-stripe.service';
import { resolveUserForIntake } from './user-details-utils';
import { upsertAddressTx } from '@/modules/practice/database/queries/address.repository';
import type { Address } from '@/modules/practice/database/schema/addresses.schema';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { userDetailsRepository } from '@/modules/user-details/database/queries/user-details.queries';
import { type SelectUserDetail } from '@/modules/user-details/database/schema/user-details.schema';

import { users } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';
import {
  UserDetailsCreated,
  UserDetailsUpdated,
  UserDetailsDeleted,
} from '@/shared/events/definitions';
import { membersRepository } from '@/shared/repositories/members.repository';
import usersRepository from '@/shared/repositories/users.repository';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import {
  ok,
  internalError,
  notFound,
  type AcceptedResponse,
} from '@/shared/utils/result';

const logger = getLogger(['user-details', 'crud-service']);

type AddressInput = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

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
  ctx: ServiceContext,
): Promise<Result<SelectUserDetail & {
  user: typeof users.$inferSelect;
} | AcceptedResponse>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'UserDetails');

  let eventData: {
    detail: SelectUserDetail;
    user: typeof users.$inferSelect;
  } | undefined;

  const { data } = params;

  const txResult = await db.transaction(async (tx) => {
    try {
      const user = await usersRepository.findByEmail(data.email);
      if (!user) {
        return notFound('User not found. Please invite them using the invitations flow first.');
      }

      let member = await membersRepository.findByOrgAndUser({
        organizationId: ctx.organizationId,
        userId: user.id,
      });
      if (!member) {
        member = await membersRepository.create({
          organizationId: ctx.organizationId,
          userId: user.id,
          role: 'client',
        });
      }

      const stripeCustomerId = await userDetailsStripeService.createCustomer({
        email: user.email,
        name: user.name,
        phone: user.phone || undefined,
        metadata: {
          organization_id: ctx.organizationId,
          source: 'blawby_clients_api',
        },
      }, ctx);

      let addressId: string | undefined;
      if (data.address) {
        const address = await upsertAddressTx(tx, {
          addressData: {
            line1: data.address.line1,
            line2: data.address.line2,
            city: data.address.city,
            state: data.address.state,
            postal_code: data.address.postalCode,
            country: data.address.country,
          },
          organizationId: ctx.organizationId,
          type: 'client',
        });
        addressId = address?.id;
      }

      const detail = await userDetailsRepository.create({
        organization_id: ctx.organizationId,
        user_id: user.id,
        stripe_customer_id: stripeCustomerId,
        address_id: addressId,
        status: data.status ?? 'lead',
        currency: data.currency ?? 'usd',
      });

      eventData = { detail, user };
      return ok({ ...detail, user });
    } catch (error) {
      logger.error('Failed to create user details: {error}', {
        error,
        organizationId: ctx.organizationId,
      });
      return internalError('Failed to create user details');
    }
  });

  if (txResult.success && eventData) {
    void UserDetailsCreated.dispatch({
      user_detail_id: eventData.detail.id,
      user_id: eventData.user.id,
      name: eventData.user.name,
      email: eventData.user.email,
      stripe_customer_id: eventData.detail.stripe_customer_id ?? undefined,
    }, { actorId: ctx.userId, organizationId: ctx.organizationId });
  }

  return txResult;
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
  ctx: ServiceContext,
): Promise<Result<SelectUserDetail>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'UserDetails');
  const { id, data } = params;

  return await db.transaction(async (tx) => {
    try {
      const detailWithUser = await userDetailsRepository.findById(id);
      if (!detailWithUser || detailWithUser.organization_id !== ctx.organizationId) {
        return notFound('User detail not found');
      }

      if (data.name || data.email || data.phone) {
        await usersRepository.update(detailWithUser.user_id, {
          name: data.name,
          email: data.email?.toLowerCase(),
          phone: data.phone,
        });

        if (detailWithUser.stripe_customer_id) {
          await userDetailsStripeService.updateCustomer({
            customerId: detailWithUser.stripe_customer_id,
            email: data.email,
            name: data.name,
            phone: data.phone,
          }, ctx);
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
            postal_code: data.address.postalCode,
            country: data.address.country,
          },
          organizationId: ctx.organizationId,
          addressId: detailWithUser.address_id,
          type: 'client',
        });
        addressId = address?.id ?? addressId;
      }

      const updated = await userDetailsRepository.update(id, {
        address_id: addressId,
        status: data.status,
        currency: data.currency,
      });
      if (!updated) return internalError('Failed to update user details');

      await UserDetailsUpdated.dispatch({
        user_detail_id: updated.id,
        changes: Object.fromEntries(Object.keys(data).map((k) => [k, true])),
      }, {
        actorId: ctx.userId,
        organizationId: ctx.organizationId,
        tx,
      });

      return ok(updated);
    } catch (error) {
      logger.error('Failed to update user details {id}: {error}', { id, error });
      return internalError('Failed to update user details');
    }
  });
};

const listUserDetails = async (
  params: {
    clientId?: string;
    search?: string;
    status?: string;
    limit?: number;
    offset?: number;
  },
  ctx: ServiceContext,
): Promise<Result<{
  data: (SelectUserDetail & {
    user: typeof users.$inferSelect;
    address: Address | null;
  })[];
  total: number;
}>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'UserDetails');

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

const deleteUserDetail = async (
  params: { id: string },
  ctx: ServiceContext,
): Promise<Result<void>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', 'UserDetails');
  const { id } = params;
  try {
    const detail = await userDetailsRepository.findById(id);
    if (!detail || detail.organization_id !== ctx.organizationId) {
      return notFound('User detail not found');
    }

    await userDetailsRepository.softDelete(id, ctx.userId);
    void UserDetailsDeleted.dispatch(
      { user_detail_id: id },
      { actorId: ctx.userId, organizationId: ctx.organizationId },
    );

    return ok(undefined);
  } catch (error) {
    logger.error('Failed to delete user detail {id}: {error}', { id, error });
    return internalError('Failed to delete user detail');
  }
};

const ensureClientSetup = async (
  params: { id: string },
  ctx: ServiceContext,
): Promise<Result<SelectUserDetail & {
  user: typeof users.$inferSelect;
}>> => {
  const { id } = params;
  try {
    const detail = await userDetailsRepository.findById(id);
    if (!detail || detail.organization_id !== ctx.organizationId) {
      return notFound('Client details not found');
    }

    const user = await usersRepository.findById(detail.user_id);
    if (!user) return notFound('User not found');

    if (!detail.stripe_customer_id) {
      const stripeCustomerId = await userDetailsStripeService.createCustomer({
        email: user.email,
        name: user.name,
        phone: user.phone || undefined,
        metadata: {
          organization_id: ctx.organizationId,
          source: 'auto_vivification_sync',
        },
      }, ctx);

      if (stripeCustomerId) {
        await userDetailsRepository.update(id, {
          stripe_customer_id: stripeCustomerId,
        });
        detail.stripe_customer_id = stripeCustomerId;
      }
    }

    void UserDetailsCreated.dispatch({
      user_detail_id: detail.id,
      user_id: user.id,
      name: user.name,
      email: user.email,
      stripe_customer_id: detail.stripe_customer_id ?? undefined,
    }, { actorId: ctx.userId, organizationId: ctx.organizationId });

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
  ctx: ServiceContext,
): Promise<Result<SelectUserDetail>> => {
  const {
    intakeId,
    userId,
    email,
    name,
    phone,
  } = params.data;
  try {
    const user = await resolveUserForIntake({
      userId,
      email,
      name,
      phone,
    });
    if (!user) {
      return internalError('Unable to process intake.');
    }

    let member = await membersRepository.findByOrgAndUser({
      organizationId: ctx.organizationId,
      userId: user.id,
    });
    if (!member) {
      member = await membersRepository.create({
        organizationId: ctx.organizationId,
        userId: user.id,
        role: 'client',
      });
    }

    const intake = await practiceClientIntakesRepository.findById(intakeId);
    if (!intake) return notFound(`Intake record with ID '${intakeId}' not found`);

    const existingDetail = await userDetailsRepository.findByOrgAndUser(ctx.organizationId, user.id);
    if (existingDetail) {
      if (!existingDetail.intake_id) {
        await userDetailsRepository.update(existingDetail.id, { intake_id: intakeId, status: 'active', updated_at: new Date() });
      }
      return ok(existingDetail);
    }

    const stripeCustomerId = await userDetailsStripeService.createCustomer({
      email: user.email,
      name: user.name,
      phone: user.phone || undefined,
      metadata: { organization_id: ctx.organizationId, intake_id: intakeId, source: 'blawby_intake' },
    }, ctx);

    const detail = await userDetailsRepository.create({
      organization_id: ctx.organizationId,
      user_id: user.id,
      intake_id: intakeId,
      address_id: intake?.address_id ?? undefined,
      stripe_customer_id: stripeCustomerId,
      status: 'active',
      event_name: 'client_intake_success',
    });

    void UserDetailsCreated.dispatch({
      user_detail_id: detail.id,
      user_id: user.id,
      name: user.name,
      email: user.email,
      stripe_customer_id: detail.stripe_customer_id ?? undefined,
    }, { actorId: 'system', actorType: 'system', organizationId: ctx.organizationId });

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
  deleteUserDetail,
  createUserDetailsFromIntake,
  ensureClientSetup,
};

// Compatibility export
export const userDetailsService = userDetailsCrudService;
