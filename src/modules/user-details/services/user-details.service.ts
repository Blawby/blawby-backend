import { getLogger } from '@logtape/logtape';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { upsertAddressTx } from '@/modules/practice/database/queries/address.repository';
import type { Address } from '@/modules/practice/database/schema/addresses.schema';
import { userDetailsRepository } from '@/modules/user-details/database/queries/user-details.queries';
import {
  type SelectUserDetail,
} from '@/modules/user-details/database/schema/user-details.schema';
import { users } from '@/schema/better-auth-schema';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { linkAnonymousUserData } from '@/shared/auth/services/link-user-data.service';
import { db } from '@/shared/database';
import { UserDetailsCreated, UserDetailsUpdated, UserDetailsDeleted } from '@/shared/events/definitions';
import { membersRepository } from '@/shared/repositories/members.repository';
import usersRepository from '@/shared/repositories/users.repository';

import type { Result } from '@/shared/types/result';
import { ok, internalError, notFound } from '@/shared/utils/result';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['user-details', 'service']);
const auth = createBetterAuthInstance(db as Parameters<typeof createBetterAuthInstance>[0]);


type AddressInput = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

const createUserDetails = async (
  organizationId: string,
  data: {
    name: string;
    email: string;
    phone?: string;
    address?: AddressInput;
    status?: string;
    currency?: string;
  },
  actorId: string,
): Promise<Result<SelectUserDetail & { user: typeof users.$inferSelect }>> => {
  return await db.transaction(async (tx) => {
    try {
      // 1. Find existing user by email or invite them
      const user = await usersRepository.findByEmail(data.email);

      if (!user) {
        // User doesn't exist - send invitation via Better Auth organization invite
        // The invitation will create the user when they accept
        try {
          await auth.api.createInvitation({
            headers: new Headers(),
            body: {
              email: data.email.toLowerCase(),
              organizationId,
              role: 'client',
            },
          });
          logger.info('Invitation sent to new client {email}', { email: data.email, organizationId });

          // For now, we cannot create user_details without a user record.
          // The user_details will be created when the invitation is accepted.
          // Return a specific error to indicate this.
          return internalError('Invitation sent to client. User details will be created when they accept the invitation.');
        } catch (inviteError) {
          logger.error('Failed to send invitation to {email}: {error}', {
            email: data.email,
            error: inviteError,
            organizationId,
          });
          return internalError('Failed to invite client. Please try again.');
        }
      }

      // 2. Create/find organization membership with role: 'client'
      let member = await membersRepository.findByOrgAndUser({ organizationId, userId: user.id });
      if (!member) {
        member = await membersRepository.create({
          organizationId,
          userId: user.id,
          role: 'client',
        });
      }


      // 3. Create Stripe customer on CONNECTED ACCOUNT
      const connectedAccount = await onboardingRepository.findByOrganizationId(organizationId);
      let stripeCustomerId: string | undefined;

      if (connectedAccount?.stripe_account_id) {
        try {
          const stripeCustomer = await stripe.customers.create({
            email: user.email,
            name: user.name,
            phone: user.phone || undefined,
            metadata: {
              organization_id: organizationId,
              source: 'blawby_clients_api',
            },
          }, {
            stripeAccount: connectedAccount.stripe_account_id,
          });
          stripeCustomerId = stripeCustomer.id;
        } catch (stripeError) {
          logger.error('Failed to create Stripe customer for user-detail {email}: {error}', {
            email: user.email,
            error: stripeError,
            organizationId,
          });
        }
      }

      // 4. Handle Address
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
          organizationId,
          type: 'client',
        });
        addressId = address?.id;
      }

      // 5. Create User Detail record
      const detail = await userDetailsRepository.create({
        organization_id: organizationId,
        user_id: user.id,
        stripe_customer_id: stripeCustomerId,
        address_id: addressId,
        status: data.status ?? 'lead',
        currency: data.currency ?? 'usd',
      });

      // 6. Publish event
      await UserDetailsCreated.dispatch({
        user_detail_id: detail.id,
        user_id: user.id,
        name: user.name,
        email: user.email,
        stripe_customer_id: detail.stripe_customer_id ?? undefined,
      }, { actorId, organizationId, tx: tx });

      return ok({ ...detail, user });
    } catch (error) {
      logger.error('Failed to create user details: {error}', { error, organizationId });
      return internalError('Failed to create user details');
    }
  });
};


const updateUserDetails = async (
  id: string,
  organizationId: string,
  data: {
    name?: string;
    email?: string;
    phone?: string;
    address?: AddressInput;
    status?: string;
    currency?: string;
  },
  actorId: string,
): Promise<Result<SelectUserDetail>> => {
  return await db.transaction(async (tx) => {
    try {
      const detailWithUser = await userDetailsRepository.findById(id);
      if (!detailWithUser || detailWithUser.organization_id !== organizationId) {
        return notFound('User detail not found');
      }

      // 1. Update user fields if provided
      if (data.name || data.email || data.phone) {
        const user = await usersRepository.findById(detailWithUser.user_id);
        if (user) {
          await usersRepository.update(detailWithUser.user_id, {
            name: data.name,
            email: data.email?.toLowerCase(),
            phone: data.phone,
          });
        }

        // Sync to Stripe if customer exists
        if (detailWithUser.stripe_customer_id) {
          const connectedAccount = await onboardingRepository.findByOrganizationId(organizationId);
          if (connectedAccount?.stripe_account_id) {
            try {
              await stripe.customers.update(detailWithUser.stripe_customer_id, {
                email: data.email || undefined,
                name: data.name || undefined,
                phone: data.phone || undefined,
              }, {
                stripeAccount: connectedAccount.stripe_account_id,
              });
            } catch (stripeError) {
              logger.error('Failed to update Stripe customer {customerId}: {error}', {
                customerId: detailWithUser.stripe_customer_id,
                error: stripeError,
              });
            }
          }
        }
      }

      // 2. Handle Address
      let address_id = detailWithUser.address_id;
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
          organizationId,
          addressId: detailWithUser.address_id,
          type: 'client',
        });
        address_id = address?.id ?? address_id;
      }

      // 3. Update User Detail record
      const updated = await userDetailsRepository.update(id, {
        address_id,
        status: data.status,
        currency: data.currency,
      });
      if (!updated) return internalError('Failed to update user details');

      await UserDetailsUpdated.dispatch({
        user_detail_id: updated.id,
        changes: Object.fromEntries(Object.keys(data).map((k) => [k, true])),
      }, { actorId, organizationId, tx: tx });

      return ok(updated);
    } catch (error) {
      logger.error('Failed to update user details {id}: {error}', { id, error });
      return internalError('Failed to update user details');
    }
  });
};

const listUserDetails = async (params: {
  organizationId: string;
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<Result<{
  data:
  (SelectUserDetail & { user: typeof users.$inferSelect; address: Address | null })[];
  total: number;
}>> => {
  try {
    const result = await userDetailsRepository.listClients(params);
    return ok(result);
  } catch (error) {
    logger.error('Failed to list user details: {error}', { error, organizationId: params.organizationId });
    return internalError('Failed to list user details');
  }
};

const getUserDetail = async (
  id: string,
  organizationId: string,
): Promise<Result<SelectUserDetail & { user: typeof users.$inferSelect }>> => {
  try {
    const detail = await userDetailsRepository.findById(id);
    if (!detail || detail.organization_id !== organizationId) {
      return notFound('User detail not found');
    }
    return ok(detail);
  } catch (error) {
    logger.error('Failed to get user detail {id}: {error}', { id, error });
    return internalError('Failed to get user detail');
  }
};

const deleteUserDetail = async (id: string, organizationId: string, actorId: string): Promise<Result<void>> => {
  try {
    const detail = await userDetailsRepository.findById(id);
    if (!detail || detail.organization_id !== organizationId) {
      return notFound('User detail not found');
    }

    await userDetailsRepository.softDelete(id, actorId);

    void UserDetailsDeleted.dispatch({ user_detail_id: id }, { actorId, organizationId });

    return ok(undefined);
  } catch (error) {
    logger.error('Failed to delete user detail {id}: {error}', { id, error });
    return internalError('Failed to delete user detail');
  }
};

const createUserDetailsFromIntake = async (params: {
  organizationId: string;
  intakeId: string;
  userId?: string; // User ID from session (anonymous or real user)
  email: string;
  name: string;
  phone?: string;
  metadata?: Record<string, unknown>;
}): Promise<Result<SelectUserDetail>> => {
  const {
    organizationId, intakeId, userId, email, name, phone,
  } = params;

  try {
    // 1. Identify user - prefer session user, fallback to email lookup
    let user: typeof users.$inferSelect | undefined;

    // Check if email already belongs to an existing user
    const existingUserByEmail = await usersRepository.findByEmail(email);

    if (userId) {
      // We have a user ID from the session (could be anonymous or real user)
      const sessionUser = await usersRepository.findById(userId);

      if (sessionUser) {
        // Check if the user is anonymous (isAnonymous flag set by Better Auth)
        const isAnonymousUser = sessionUser.isAnonymous === true;

        if (isAnonymousUser && existingUserByEmail && existingUserByEmail.id !== userId) {
          // Anonymous user provided an email that belongs to a different real user
          // Link anonymous data to the existing real user
          await linkAnonymousUserData({
            anonymousUser: { id: userId, email: '' },
            newUser: { id: existingUserByEmail.id, email: existingUserByEmail.email },
          });

          // Update existing user with latest info
          user = await usersRepository.update(existingUserByEmail.id, {
            name,
            phone,
            primaryWorkspace: 'client',
          });

          // Remove the anonymous user (Better Auth will clean up accounts)
          await auth.api.removeUser({
            headers: new Headers(),
            body: { userId },
          });
        } else if (isAnonymousUser) {
          // Anonymous user - update with intake info (this is the normal flow)
          user = await usersRepository.update(userId, {
            email: email.toLowerCase(),
            name,
            phone,
            primaryWorkspace: 'client',
            // Keep isAnonymous: true - they'll set password later via Better Auth signup
          });
        } else {
          // Real user using intake - just update their info if needed
          user = await usersRepository.update(userId, {
            name: name || sessionUser.name,
            phone: phone || sessionUser.phone || undefined,
            primaryWorkspace: 'client',
          });
        }
      }
    }

    // Fallback: no userId or anonymous user not found
    if (!user) {
      if (existingUserByEmail) {
        // Update existing user
        user = await usersRepository.update(existingUserByEmail.id, {
          name,
          phone,
          primaryWorkspace: 'client',
        });
      } else {
        // No anonymous user and no existing user - cannot proceed
        // Intake flow requires either an anonymous session or an existing account
        logger.error('Intake failed - no anonymous user and no existing account for {email}', {
          email,
          organizationId,
          intakeId,
        });
        return internalError('Unable to process intake. Please sign in or create an account first.');
      }
    }

    if (!user) {
      return internalError('Failed to handle user record during intake');
    }


    // 2. Create/find organization membership with role: 'client'
    let member = await membersRepository.findByOrgAndUser({ organizationId, userId: user.id });
    if (!member) {
      member = await membersRepository.create({
        organizationId,
        userId: user.id,
        role: 'client',
      });
    }


    // 3. Check if user_details already exists for this org+user
    const existingDetail = await userDetailsRepository.findByOrgAndUser(organizationId, user.id);
    if (existingDetail) {
      if (!existingDetail.intake_id) {
        await userDetailsRepository.update(existingDetail.id, {
          intake_id: intakeId,
          status: 'active',
          updated_at: new Date(),
        });
      }
      return ok(existingDetail);
    }

    // 4. Create Stripe customer on CONNECTED ACCOUNT
    const connectedAccount = await onboardingRepository.findByOrganizationId(organizationId);
    let stripeCustomerId: string | undefined;

    if (connectedAccount?.stripe_account_id) {
      try {
        const stripeCustomer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          phone: user.phone || undefined,
          metadata: {
            organization_id: organizationId,
            intake_id: intakeId,
            source: 'blawby_intake',
          },
        }, {
          stripeAccount: connectedAccount.stripe_account_id,
        });
        stripeCustomerId = stripeCustomer.id;
      } catch (stripeError) {
        logger.error('Failed to create Stripe customer from intake for {email}: {error}', {
          email: user.email,
          error: stripeError,
        });
      }
    }

    // 5. Create User Detail record
    const detail = await userDetailsRepository.create({
      organization_id: organizationId,
      user_id: user.id,
      intake_id: intakeId,
      stripe_customer_id: stripeCustomerId,
      status: 'active',
      event_name: 'client_intake_success',
    });

    // 6. Publish event
    void UserDetailsCreated.dispatch({
      user_detail_id: detail.id,
      user_id: user.id,
      name: user.name,
      email: user.email,
      stripe_customer_id: detail.stripe_customer_id ?? undefined,
    }, { actorId: 'system', actorType: 'system', organizationId });

    return ok(detail);
  } catch (error) {
    logger.error('Failed to create user details from intake {intakeId}: {error}', { intakeId, error });
    return internalError('Failed to create user details from intake');
  }
};

export const userDetailsService = {
  createUserDetails,
  updateUserDetails,
  listUserDetails,
  getUserDetail,
  deleteUserDetail,
  createUserDetailsFromIntake,
};
