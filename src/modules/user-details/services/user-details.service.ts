import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { upsertAddressTx } from '@/modules/practice/database/queries/address.repository';
import type { Address } from '@/modules/practice/database/schema/addresses.schema';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { userDetailsRepository } from '@/modules/user-details/database/queries/user-details.queries';
import {
  type SelectUserDetail,
} from '@/modules/user-details/database/schema/user-details.schema';
import { users } from '@/schema/better-auth-schema';
import { linkAnonymousUserData } from '@/shared/auth/services/link-user-data.service';
import { db } from '@/shared/database';
import { UserDetailsCreated, UserDetailsUpdated, UserDetailsDeleted } from '@/shared/events/definitions';
import { membersRepository } from '@/shared/repositories/members.repository';
import usersRepository from '@/shared/repositories/users.repository';

import type { Result } from '@/shared/types/result';
import { ok, internalError, notFound, type AcceptedResponse } from '@/shared/utils/result';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['user-details', 'service']);


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
): Promise<Result<SelectUserDetail & { user: typeof users.$inferSelect } | AcceptedResponse>> => {
  // Variables to capture for post-transaction event dispatch
  let eventData: {
    detail: SelectUserDetail;
    user: typeof users.$inferSelect;
  } | undefined;

  const txResult = await db.transaction(async (tx) => {
    try {
      // 1. Find existing user by email or invite them
      const user = await usersRepository.findByEmail(data.email);

      if (!user) {
        // User doesn't exist - they need to be invited first via:
        // 1. Admin invite flow (/api/practice/invitations)
        // 2. Client intake flow (magic link after payment)
        return notFound('User not found. Please invite them using the invitations flow first.');
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

      // Capture data for post-transaction event dispatch
      eventData = { detail, user };

      return ok({ ...detail, user });
    } catch (error) {
      logger.error('Failed to create user details: {error}', { error, organizationId });
      return internalError('Failed to create user details');
    }
  });

  // 6. Publish event AFTER transaction commits successfully
  if (txResult.success && eventData) {
    void UserDetailsCreated.dispatch({
      user_detail_id: eventData.detail.id,
      user_id: eventData.user.id,
      name: eventData.user.name,
      email: eventData.user.email,
      stripe_customer_id: eventData.detail.stripe_customer_id ?? undefined,
    }, { actorId, organizationId });
  }

  return txResult;
};


/**
 * Ensures a client is fully set up (Stripe customer created, events dispatched).
 * Can be called asynchronously (voided) to avoid blocking main processes.
 */
const ensureClientSetup = async (
  id: string,
  organizationId: string,
  actorId: string,
): Promise<Result<SelectUserDetail & { user: typeof users.$inferSelect }>> => {
  try {
    const detail = await userDetailsRepository.findById(id);
    if (!detail || detail.organization_id !== organizationId) {
      return notFound('Client details not found');
    }

    const user = await usersRepository.findById(detail.user_id);
    if (!user) return notFound('User not found');

    // 1. Create Stripe customer if missing
    if (!detail.stripe_customer_id) {
      const connectedAccount = await onboardingRepository.findByOrganizationId(organizationId);
      if (connectedAccount?.stripe_account_id) {
        try {
          const stripeCustomer = await stripe.customers.create({
            email: user.email,
            name: user.name,
            phone: user.phone || undefined,
            metadata: {
              organization_id: organizationId,
              source: 'auto_vivification_sync',
            },
          }, {
            stripeAccount: connectedAccount.stripe_account_id,
          });

          await userDetailsRepository.update(id, {
            stripe_customer_id: stripeCustomer.id,
          });
          detail.stripe_customer_id = stripeCustomer.id;
        } catch (stripeError) {
          logger.error('Failed to create background Stripe customer for {id}: {error}', {
            id, error: stripeError,
          });
        }
      }
    }

    // 2. Publish event if it hasn't been handled yet (minimal check)
    void UserDetailsCreated.dispatch({
      user_detail_id: detail.id,
      user_id: user.id,
      name: user.name,
      email: user.email,
      stripe_customer_id: detail.stripe_customer_id ?? undefined,
    }, { actorId, organizationId });

    return ok({ ...detail, user });
  } catch (error) {
    logger.error('Failed to ensure client setup for {id}: {error}', { id, error });
    return internalError('Failed to complete client setup');
  }
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
  user_uuid?: string;
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


const resolveUserForIntake = async (params: {
  userId?: string;
  email: string;
  name: string;
  phone?: string;
}): Promise<typeof users.$inferSelect | undefined> => {
  const {
    userId, email, name, phone,
  } = params;
  const existingUserByEmail = await usersRepository.findByEmail(email);

  // 1. Check if we have a valid session user
  if (userId) {
    const sessionUser = await usersRepository.findById(userId);

    if (sessionUser) {
      const isAnonymousUser = sessionUser.isAnonymous === true;

      // Case 1: Anonymous user provided an email that belongs to a different real user
      if (isAnonymousUser && existingUserByEmail && existingUserByEmail.id !== userId) {
        await linkAnonymousUserData({
          anonymousUser: { id: userId, email: '' },
          newUser: { id: existingUserByEmail.id, email: existingUserByEmail.email },
        });

        // Remove the anonymous user directly from DB to bypass auth check in webhook context
        await db.delete(users).where(eq(users.id, userId));

        return usersRepository.update(existingUserByEmail.id, {
          name,
          phone,
          primaryWorkspace: 'client',
        });
      }

      // Case 2: Anonymous user updating their own generic profile (normal flow)
      if (isAnonymousUser) {
        return usersRepository.update(userId, {
          email: email.toLowerCase(),
          name,
          phone,
          // Do NOT set primaryWorkspace: 'client' yet.
          // We save the info, but they remain anonymous until they sign up/accept invite.
        });
      }

      // Case 3: Real user using intake
      return usersRepository.update(userId, {
        name: name || sessionUser.name,
        phone: phone || sessionUser.phone || undefined,
        // If they are already a real user, we assume they are already a client or we don't force it here?
        // Actually, if a real user does intake, they probably ARE a client now.
        // But for consistency with the request "don't convert", maybe we leave this alone too if they aren't one?
        // Let's assume real users are already set up. We just update contact info.
      });
    }
  }

  // Case 4: No session user, but email exists (logged out real user)
  if (existingUserByEmail) {
    return usersRepository.update(existingUserByEmail.id, {
      name,
      phone,
    });
  }

  // Case 5: No matching user found
  return undefined;
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
    const user = await resolveUserForIntake({
      userId, email, name, phone,
    });

    if (!user) {
      logger.error('Intake failed - no anonymous user and no existing account for {email}', {
        email,
        organizationId,
        intakeId,
      });
      return internalError('Unable to process intake. Please sign in or create an account first.');
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


    // 3. Fetch intake record to get address_id
    const intake = await practiceClientIntakesRepository.findById(intakeId);

    if (!intake) {
      return notFound(`Intake record with ID '${intakeId}' not found`);
    }

    // 4. Check if user_details already exists for this org+user
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
      address_id: intake?.address_id ?? undefined,
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
  deleteUserDetail,
  createUserDetailsFromIntake,
  ensureClientSetup,
};
