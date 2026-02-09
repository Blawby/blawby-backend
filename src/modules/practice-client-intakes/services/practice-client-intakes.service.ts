import { randomUUID } from 'node:crypto';
import { getLogger } from '@logtape/logtape';
import { eq, sql } from 'drizzle-orm';
import type { Stripe } from 'stripe';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { isAccountActive } from '@/modules/onboarding/services/connected-accounts.service';
import { upsertAddressTx } from '@/modules/practice/database/queries/address.repository';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import {
  practiceClientIntakesSchema,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import type {
  InsertPracticeClientIntake,
  PracticeClientIntakeMetadata,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import type {
  IntakeSettingsResponse as PracticeClientIntakeSettings,
  CreatePracticeClientIntakeRequest,
  CreateIntakeResponse as CreatePracticeClientIntakeResponse,
  IntakeStatusResponse as PracticeClientIntakeStatus,
  CreateCheckoutSessionResponse as PracticeClientIntakeCheckoutSessionResponse,
  IntakePostPayStatusResponse as PracticeClientIntakePostPayStatusResponse,
  ClaimPracticeClientIntakeResponse,
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { userDetailsService } from '@/modules/user-details/services/user-details.service';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { IntakePaymentCreated } from '@/shared/events/definitions';
import type { PrefillData } from '@/shared/types/prefill';
import type { Result } from '@/shared/types/result';
import { getMatchingFrontendUrl } from '@/shared/utils/env';
import { result } from '@/shared/utils/result';
import { stripe } from '@/shared/utils/stripe-client';

const { practiceClientIntakes, practiceClientIntakeMetadataSchema } = practiceClientIntakesSchema;


const logger = getLogger(['practice-client-intakes', 'service']);

// result utilities are accessed via result object (Standard #6)

type ResolveCheckoutSessionResult = {
  intake?: Awaited<ReturnType<typeof practiceClientIntakesRepository.findById>>;
  session?: Stripe.Checkout.Session;
};

type ClaimIntakeAbort = {
  __claimIntakeResult: true;
  result: Result<ClaimPracticeClientIntakeResponse>;
};

const isClaimIntakeAbort = (value: unknown): value is ClaimIntakeAbort => {
  return Boolean(
    value
    && typeof value === 'object'
    && '__claimIntakeResult' in value
    && (value as { __claimIntakeResult?: unknown }).__claimIntakeResult === true
    && 'result' in value,
  );
};
const resolvePracticeClientIntakeByCheckoutSessionId = async (
  sessionId: string,
  options?: { requireSession?: boolean },
): Promise<ResolveCheckoutSessionResult> => {
  const { requireSession = false } = options ?? {};
  let intake: Awaited<ReturnType<typeof practiceClientIntakesRepository.findById>> | undefined
    = await practiceClientIntakesRepository.findByStripeCheckoutSessionId(sessionId);

  if (intake && !requireSession) {
    return { intake };
  }

  try {
    const session: Stripe.Checkout.Session = await stripe.checkout.sessions.retrieve(sessionId);
    const intakeUuid: string | undefined = typeof session.metadata?.intake_uuid === 'string'
      ? session.metadata.intake_uuid
      : (typeof session.client_reference_id === 'string' ? session.client_reference_id : undefined);

    if (!intakeUuid) {
      return { session };
    }

    if (!intake) {
      intake = await practiceClientIntakesRepository.findById(intakeUuid);
    }

    if (intake && !intake.stripe_checkout_session_id) {
      await practiceClientIntakesRepository.update(intake.id, {
        stripe_checkout_session_id: session.id,
      });
    }

    return { intake, session };
  } catch (error) {
    logger.error('Failed to resolve checkout session {sessionId} in resolvePracticeClientIntakeByCheckoutSessionId', {
      sessionId,
      error,
    });
    throw error;
  }
};

/**
 * Get practice client intake settings by slug
 */
const getPracticeClientIntakeSettings = async (
  slug: string,
): Promise<Result<PracticeClientIntakeSettings>> => {
  try {
    // 1. Find organization by slug
    const organization = await organizationRepository.findBySlug(slug);

    if (!organization) {
      return result.notFound(`Organization with slug '${slug}' not found`);
    }

    if (!organization.activeSubscriptionId) {
      return result.forbidden('Organization does not have an active subscription');
    }

    // 2. Get connected account
    const connectedAccount = await onboardingRepository.findByOrganizationId(organization.id);

    if (!connectedAccount) {
      return result.forbidden('Organization does not have a connected Stripe account');
    }

    // 3. Validate connected account
    if (!(await isAccountActive(connectedAccount))) {
      return result.forbidden('Connected account is not ready to accept payments');
    }

    return result.ok({
      success: true,
      data: {
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          logo: organization.logo ?? undefined,
        },
        settings: {
          payment_link_enabled: organization?.paymentLinkEnabled ?? false,
          prefill_amount: organization?.paymentLinkPrefillAmount ?? 0,
        },
        connected_account: {
          id: connectedAccount.id,
          charges_enabled: connectedAccount.charges_enabled,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to get organization intake settings for {slug}: {error}', { error, slug });
    return result.internalError('Failed to get organization intake settings');
  }
};

/**
 * Create a new practice client intake
 */
const createPracticeClientIntake = async (
  request: CreatePracticeClientIntakeRequest & { clientIp?: string; userAgent?: string; origin?: string | null },
): Promise<Result<CreatePracticeClientIntakeResponse | PracticeClientIntakeSettings>> => {
  try {
    const settingsResult = await getPracticeClientIntakeSettings(request.slug);
    if (!settingsResult.success || !settingsResult.data.data) {
      return settingsResult;
    }

    const { organization } = settingsResult.data.data;

    // 2. Get connected account details
    const connectedAccount = await onboardingRepository.findByOrganizationId(organization.id);

    if (!connectedAccount) {
      return result.fail('Connected account not found');
    }

    // user_id comes from authenticated session context (set by HTTP handler)
    // No need to validate - session context is trusted
    const validatedUserId = request.user_id;

    const intakeId: string = randomUUID();

    const conversationParam = request.conversation_id
      ? `&conversation_id=${encodeURIComponent(request.conversation_id)}`
      : '';

    const stripePaymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Client Intake - ${organization.name}`,
              description: request.description || 'Legal consultation payment',
            },
            unit_amount: request.amount,
          },
          quantity: 1,
        },
      ],
      // Connected account appears as merchant of record
      on_behalf_of: connectedAccount.stripe_account_id,
      // Transfer funds to connected account (destination charges)
      transfer_data: {
        destination: connectedAccount.stripe_account_id,
      },
      payment_intent_data: {
        metadata: {
          email: request.email,
          name: request.name,
          phone: request.phone || '',
          on_behalf_of: request.on_behalf_of || '',
          opposing_party: request.opposing_party || '',
          description: request.description || '',
          organization_id: organization.id,
          intake_uuid: intakeId,
          ...(request.address && { address: JSON.stringify(request.address) }),
          ...(validatedUserId && { user_id: validatedUserId }),
        },
      },

      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${getMatchingFrontendUrl(request.origin)}/pay?uuid=${intakeId}&return_to=/p/${organization.slug}${conversationParam}`,
        },
      },
    });

    const practiceClientIntake = await db.transaction(async (tx) => {
      // 4. Create address record if provided
      let addressId: string | undefined;
      if (request.address) {
        const addressRecord = await upsertAddressTx(tx, {
          addressData: request.address,
          organizationId: organization.id,
          userId: validatedUserId,
          type: 'client_intake',
        });
        addressId = addressRecord?.id;
      }

      // 5. Store practice client intake in database
      const practiceClientIntakeData: InsertPracticeClientIntake = {
        id: intakeId,
        organization_id: organization.id,
        connected_account_id: connectedAccount.id,
        stripe_payment_link_id: stripePaymentLink.id,
        address_id: addressId,
        conversation_id: request.conversation_id,
        amount: request.amount,
        currency: 'usd',
        status: 'open', // Payment Link status: open, completed, expired
        metadata: {
          email: request.email,
          name: request.name,
          phone: request.phone,
          on_behalf_of: request.on_behalf_of,
          opposing_party: request.opposing_party,
          description: request.description,
          address: request.address,
          ...(validatedUserId && { user_id: validatedUserId }),
        },
        client_ip: request.clientIp,
        user_agent: request.userAgent,
      };

      return await practiceClientIntakesRepository.create(practiceClientIntakeData, tx);
    });

    // 6. Publish practice client intake created event
    void IntakePaymentCreated.dispatch({
      intake_payment_id: practiceClientIntake.id,
      uuid: practiceClientIntake.id,
      stripe_payment_link_id: stripePaymentLink.id,
      amount: request.amount,
      currency: 'usd',
      client_email: request.email,
      client_name: request.name,
      created_at: new Date().toISOString(),
    }, {
      actorId: 'organization',
      organizationId: organization.id,
    });

    return result.ok({
      success: true,
      data: {
        uuid: practiceClientIntake.id,
        payment_link_url: stripePaymentLink.url,
        amount: request.amount,
        currency: 'usd',
        status: 'open',
        organization: {
          name: organization.name,
          logo: organization.logo ?? undefined,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to create practice client intake for {slug}: {error}', { error, slug: request.slug });
    return result.internalError('Failed to create practice client intake');
  }
};

/**
 * Update practice client intake amount
 * Note: Payment Links cannot be updated directly. This creates a new Payment Link with the updated amount.
 */
const updatePracticeClientIntake = async (
  _uuid: string,
  _amount: number,
): Promise<Result<void>> => {
  return result.badRequest('Updating practice client intakes is no longer supported. Create a new intake instead.');
};

/**
 * Create a Stripe Checkout Session for an existing intake
 */
const createPracticeClientIntakeCheckoutSession = async (
  request: { uuid: string; user_id?: string; origin?: string | null },
): Promise<Result<PracticeClientIntakeCheckoutSessionResponse>> => {
  try {
    const practiceClientIntake = await practiceClientIntakesRepository.findById(request.uuid);
    if (!practiceClientIntake) {
      return result.notFound(`Practice client intake with UUID '${request.uuid}' not found`);
    }

    if (practiceClientIntake.status !== 'open') {
      return result.badRequest('Intake is not eligible for checkout session creation');
    }

    const organization = await organizationRepository.findById(practiceClientIntake.organization_id);
    if (!organization) {
      return result.notFound('Organization not found');
    }

    const connectedAccount = await onboardingRepository.findByOrganizationId(organization.id);
    if (!connectedAccount) {
      return result.fail('Connected account not found');
    }

    if (!(await isAccountActive(connectedAccount))) {
      return result.forbidden('Connected account is not ready to accept payments');
    }

    // Reuse any existing session to avoid duplicate Checkout Sessions for the same intake.
    if (practiceClientIntake.stripe_checkout_session_id) {
      try {
        const { session: existingSession } = await resolvePracticeClientIntakeByCheckoutSessionId(
          practiceClientIntake.stripe_checkout_session_id,
          { requireSession: true },
        );

        const isReusable = existingSession
          && existingSession.status === 'open'
          && existingSession.payment_status !== 'paid';

        if (isReusable && existingSession?.url) {
          return result.ok({
            success: true,
            data: {
              url: existingSession.url,
              session_id: existingSession.id,
            },
          });
        }
      } catch (error) {
        logger.error('Failed to retrieve checkout session for intake {uuid}: {error}', {
          uuid: practiceClientIntake.id,
          error,
        });
        // If retrieval fails, create a new session below
      }
    }

    const metadata: Record<string, string> = {
      intake_uuid: practiceClientIntake.id,
      organization_id: organization.id,
    };

    if (practiceClientIntake.metadata?.email) {
      metadata.email = practiceClientIntake.metadata.email;
    }

    if (practiceClientIntake.metadata?.name) {
      metadata.name = practiceClientIntake.metadata.name;
    }

    if (practiceClientIntake.metadata?.phone) {
      metadata.phone = practiceClientIntake.metadata.phone;
    }

    if (practiceClientIntake.metadata?.on_behalf_of) {
      metadata.on_behalf_of = practiceClientIntake.metadata.on_behalf_of;
    }

    if (practiceClientIntake.metadata?.opposing_party) {
      metadata.opposing_party = practiceClientIntake.metadata.opposing_party;
    }

    if (practiceClientIntake.metadata?.description) {
      metadata.description = practiceClientIntake.metadata.description;
    }

    if (practiceClientIntake.conversation_id) {
      metadata.conversation_id = practiceClientIntake.conversation_id;
    }

    if (request.user_id) {
      metadata.user_id = request.user_id;
    }

    const conversationParam: string = practiceClientIntake.conversation_id
      ? `&conversation_id=${encodeURIComponent(practiceClientIntake.conversation_id)}`
      : '';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: practiceClientIntake.id,
      success_url: `${getMatchingFrontendUrl(request.origin)}/pay?session_id={CHECKOUT_SESSION_ID}&return_to=/p/${organization.slug}${conversationParam}`,
      cancel_url: `${getMatchingFrontendUrl(request.origin)}/pay?session_id={CHECKOUT_SESSION_ID}&return_to=/p/${organization.slug}&canceled=true${conversationParam}`,
      line_items: [
        {
          price_data: {
            currency: practiceClientIntake.currency,
            product_data: {
              name: `Client Intake - ${organization.name}`,
              description: practiceClientIntake.metadata?.description || 'Legal consultation payment',
            },
            unit_amount: practiceClientIntake.amount,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        transfer_data: {
          destination: connectedAccount.stripe_account_id,
        },
        metadata,
        ...(practiceClientIntake.application_fee && {
          application_fee_amount: practiceClientIntake.application_fee,
        }),
      },
      metadata,
    });

    if (!session.url) {
      return result.internalError('Stripe Checkout Session URL missing');
    }

    const updatedMetadata: PracticeClientIntakeMetadata | undefined = request.user_id
      ? {
        ...practiceClientIntake.metadata ?? { email: '', name: '' },
        user_id: practiceClientIntake.metadata?.user_id ?? request.user_id,
      }
      : practiceClientIntake.metadata ?? undefined;

    await practiceClientIntakesRepository.update(practiceClientIntake.id, {
      stripe_checkout_session_id: session.id,
      metadata: updatedMetadata ?? undefined,
    });

    return result.ok({
      success: true,
      data: {
        url: session.url,
        session_id: session.id,
      },
    });
  } catch (error) {
    logger.error('Failed to create checkout session for intake {uuid}: {error}', {
      uuid: request.uuid,
      error,
    });
    return result.internalError('Failed to create checkout session');
  }
};


/**
 * Get practice client intake status by UUID
 */
const getPracticeClientIntakeStatus = async (
  uuid: string,
  requestingUserId?: string,
): Promise<Result<PracticeClientIntakeStatus>> => {
  try {
    const practiceClientIntake = await practiceClientIntakesRepository.findById(uuid);
    if (!practiceClientIntake) {
      return result.notFound(`Practice client intake with UUID '${uuid}' not found`);
    }

    // Validate and parse metadata if present
    let metadata: PracticeClientIntakeMetadata | null = null;
    if (practiceClientIntake.metadata) {
      try {
        metadata = practiceClientIntakeMetadataSchema.parse(practiceClientIntake.metadata);
      } catch {
        // If metadata doesn't match schema, return null
        metadata = null;
      }
    }

    const isOwner = metadata?.user_id && requestingUserId
      ? metadata.user_id === requestingUserId
      : false;

    return result.ok({
      success: true,
      data: {
        uuid: practiceClientIntake.id,
        organization_id: practiceClientIntake.organization_id,
        amount: practiceClientIntake.amount,
        currency: practiceClientIntake.currency,
        status: practiceClientIntake.status,
        address_id: isOwner ? practiceClientIntake.address_id || undefined : undefined,
        conversation_id: isOwner ? practiceClientIntake.conversation_id || undefined : undefined,
        stripe_charge_id: practiceClientIntake.stripe_charge_id || undefined,
        metadata: isOwner ? metadata ?? undefined : undefined,
        succeeded_at: practiceClientIntake.succeeded_at?.toISOString() || undefined,
        created_at: practiceClientIntake.created_at.toISOString(),
      },

    });
  } catch (error) {
    logger.error('Failed to get practice client intake status for {uuid}: {error}', { error, uuid });
    return result.internalError('Failed to get practice client intake status');
  }
};

/**
 * Get practice client intake post-pay status by Checkout Session ID
 */
const getPracticeClientIntakePostPayStatus = async (
  sessionId: string,
): Promise<Result<PracticeClientIntakePostPayStatusResponse>> => {
  try {
    const { intake } = await resolvePracticeClientIntakeByCheckoutSessionId(sessionId);

    if (!intake) {
      return result.notFound('Checkout session not found');
    }

    if (intake.status !== 'succeeded') {
      return result.ok({
        success: true,
        data: {
          paid: false,
        },
      });
    }

    return result.ok({
      success: true,
      data: {
        paid: true,
        intake_uuid: intake.id,
        organization_id: intake.organization_id,
      },
    });
  } catch (error) {
    logger.error('Failed to get post-pay status for session {sessionId}: {error}', {
      sessionId,
      error,
    });
    return result.internalError('Failed to get post-pay status');
  }
};

/**
 * Claim a paid intake and link to authenticated user
 */
const claimPracticeClientIntakePayment = async (
  request: { session_id: string; user_id: string },
): Promise<Result<ClaimPracticeClientIntakeResponse>> => {
  try {
    const { intake } = await resolvePracticeClientIntakeByCheckoutSessionId(request.session_id);

    if (!intake) {
      return result.notFound('Checkout session not found');
    }

    const transactionResult = await db.transaction(async (tx) => {
      const rollbackWithResult = (resultValue: Result<ClaimPracticeClientIntakeResponse>): never => {
        throw {
          __claimIntakeResult: true,
          result: resultValue,
        } satisfies ClaimIntakeAbort;
      };

      await tx.execute(sql`
        SELECT 1
        FROM "practice_client_intakes"
        WHERE "id" = ${intake.id}
        FOR UPDATE
      `);

      const [lockedIntake] = await tx
        .select()
        .from(practiceClientIntakes)
        .where(eq(practiceClientIntakes.id, intake.id))
        .limit(1);

      if (!lockedIntake) {
        rollbackWithResult(result.notFound('Practice client intake not found'));
      }

      if (lockedIntake.status !== 'succeeded') {
        rollbackWithResult(result.badRequest('Payment must be completed before claiming intake'));
      }

      const intakeMetadata: PracticeClientIntakeMetadata = lockedIntake.metadata ?? { email: '', name: '' };
      if (!intakeMetadata.email || !intakeMetadata.name) {
        rollbackWithResult(result.badRequest('Intake metadata is incomplete'));
      }

      if (intakeMetadata.user_id && intakeMetadata.user_id !== request.user_id) {
        rollbackWithResult(result.forbidden('This intake has already been claimed by another user'));
      }

      if (!intakeMetadata.user_id) {
        await tx
          .update(practiceClientIntakes)
          .set({
            metadata: {
              ...intakeMetadata,
              user_id: request.user_id,
            },
            updated_at: new Date(),
          })
          .where(eq(practiceClientIntakes.id, intake.id));
      }

      const userDetailsResult = await userDetailsService.createUserDetailsFromIntake({
        organizationId: lockedIntake.organization_id,
        intakeId: lockedIntake.id,
        userId: request.user_id,
        email: intakeMetadata.email,
        name: intakeMetadata.name,
        phone: intakeMetadata.phone,
      });

      if (!userDetailsResult.success) {
        rollbackWithResult(
          result.fail(userDetailsResult.error.message, userDetailsResult.error.status, userDetailsResult.error.code),
        );
      }

      return result.ok({
        success: true,
        data: {
          intake_uuid: lockedIntake.id,
          organization_id: lockedIntake.organization_id,
        },
      });
    });

    return transactionResult;
  } catch (error) {
    if (isClaimIntakeAbort(error)) {
      return error.result;
    }
    logger.error('Failed to claim intake for session {sessionId}: {error}', {
      sessionId: request.session_id,
      error,
    });
    return result.internalError('Failed to claim intake');
  }
};

/**
 * Trigger a magic link for the user associated with an intake.
 * When the user clicks the magic link and authenticates, the onLinkAccount
 * hook will add them to the organization as a client.
 */
const triggerIntakeInvitation = async (
  uuid: string,
  sessionUserId: string,
  requestHeaders: Headers,
): Promise<Result<{ success: true; message: string }>> => {
  try {
    // 1. Get intake and verify ownership
    const intakeResult = await getPracticeClientIntakeStatus(uuid, sessionUserId);

    if (!intakeResult.success || !intakeResult.data?.data) {
      return intakeResult as Result<never>;
    }

    const intakeData = intakeResult.data.data;
    const metadata = intakeData.metadata;

    if (metadata?.user_id !== sessionUserId) {
      return result.forbidden('You do not own this intake');
    }

    if (intakeData.status !== 'succeeded') {
      return result.badRequest('Payment must be completed before sending an invitation');
    }

    if (!metadata?.email) {
      return result.badRequest('No email address found in intake data');
    }

    // 2. Build prefill data object
    const organization = await organizationRepository.findById(intakeData.organization_id);
    if (!organization) {
      return result.notFound('Organization not found');
    }

    const prefillData: PrefillData = {
      type: 'intake',
      intakeId: uuid,
      conversationId: intakeData.conversation_id ?? '',
      email: metadata.email,
      orgName: organization.name,
      orgSlug: organization.slug,
    };

    // 3. Base64url encode the data
    const encodedData = Buffer.from(JSON.stringify(prefillData)).toString('base64url');

    // 4. Send magic link via Better Auth
    const auth = createBetterAuthInstance(db);

    await auth.api.signInMagicLink({
      body: {
        email: metadata.email,
        callbackURL: `${getMatchingFrontendUrl(requestHeaders.get('origin'))}/auth/accept-invitation?data=${encodedData}`,
      },
      headers: requestHeaders,
    });

    return result.ok({ success: true, message: 'Magic link sent to your email' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to send magic link for intake {uuid}: {error} {details}', {
      uuid,
      error: errorMessage,
      details: JSON.stringify(error, Object.getOwnPropertyNames(error)),
    });
    return result.internalError('An unexpected error occurred while sending the magic link');
  }
};


export const practiceClientIntakesService = {
  getPracticeClientIntakeSettings,
  createPracticeClientIntake,
  updatePracticeClientIntake,
  createPracticeClientIntakeCheckoutSession,
  getPracticeClientIntakeStatus,
  getPracticeClientIntakePostPayStatus,
  claimPracticeClientIntakePayment,
  triggerIntakeInvitation,
};
