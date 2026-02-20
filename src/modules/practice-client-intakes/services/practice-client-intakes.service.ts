import { randomUUID } from 'node:crypto';
import { getLogger } from '@logtape/logtape';
import { eq, sql } from 'drizzle-orm';
import type { Stripe } from 'stripe';
import { z } from 'zod';
import { fundRouterService } from '@/modules/invoices/services/fund-router.service';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
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
  SelectPracticeClientIntake,
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
import { intakeValidations } from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';
import { userDetailsRepository } from '@/modules/user-details/database/queries/user-details.queries';
import { userDetailsService } from '@/modules/user-details/services/user-details.service';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { IntakePaymentCreated } from '@/shared/events/definitions';
import { appConfigService } from '@/shared/services/app-config.service';
import type { PrefillData } from '@/shared/types/prefill';
import type { Result, PaginatedResultWithMeta } from '@/shared/types/result';
import { getMatchingFrontendUrl } from '@/shared/utils/env';
import { result } from '@/shared/utils/result';
import { stripe } from '@/shared/utils/stripe-client';

const { practiceClientIntakes, practiceClientIntakeMetadataSchema } = practiceClientIntakesSchema;

const logger = getLogger(['practice-client-intakes', 'service']);

const parseMetadata = (rawMetadata: unknown): PracticeClientIntakeMetadata | null => {
  if (!rawMetadata) return null;
  try {
    return practiceClientIntakeMetadataSchema.parse(rawMetadata);
  } catch {
    return null;
  }
};

const formatIntakeResponse = (
  intake: SelectPracticeClientIntake,
  options?: { requestingUserId?: string; isAdmin?: boolean },
) => {
  const { requestingUserId, isAdmin = false } = options ?? {};
  const metadata = parseMetadata(intake.metadata);
  const isAuthorized = isAdmin || (metadata?.user_id && requestingUserId
    ? metadata.user_id === requestingUserId
    : false);

  return {
    uuid: intake.id,
    organization_id: intake.organization_id,
    amount: intake.amount,
    currency: intake.currency,
    status: intake.status,
    address_id: isAuthorized ? intake.address_id ?? undefined : undefined,
    conversation_id: isAuthorized ? intake.conversation_id ?? null : null,
    stripe_charge_id: intake.stripe_charge_id ?? null,
    metadata: isAuthorized && metadata
      ? {
        email: metadata.email,
        name: metadata.name,
        phone: metadata.phone ?? undefined,
        on_behalf_of: metadata.on_behalf_of ?? undefined,
        opposing_party: metadata.opposing_party ?? undefined,
        description: metadata.description ?? undefined,
      }
      : { email: '', name: '' },
    succeeded_at: intake.succeeded_at?.toISOString() ?? null,
    created_at: intake.created_at.toISOString(),
    urgency: (intake.urgency === 'routine' || intake.urgency === 'time_sensitive' || intake.urgency === 'emergency'
      ? intake.urgency as 'routine' | 'time_sensitive' | 'emergency'
      : null),
    desired_outcome: intake.desired_outcome ?? null,
    court_date: intake.court_date?.toISOString() ?? null,
    has_documents: intake.has_documents ?? null,
    income: intake.income ?? null,
    household_size: intake.household_size ?? null,
    case_strength: intake.case_strength ?? null,
  };
};

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
        application_fee: fundRouterService.calculateApplicationFee(request.amount),
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
        // AI & Triage Fields
        urgency: request.urgency,
        desired_outcome: request.desired_outcome,
        court_date: request.court_date ? new Date(request.court_date) : undefined,
        has_documents: request.has_documents,
        income: request.income,
        household_size: request.household_size,
        case_strength: request.case_strength,
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
        urgency: request.urgency,
        desired_outcome: request.desired_outcome,
        court_date: request.court_date,
        has_documents: request.has_documents,
        income: request.income,
        household_size: request.household_size,
        case_strength: request.case_strength,
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
  uuid: string,
  body: z.infer<typeof intakeValidations.updatePracticeClientIntakeSchema>,
): Promise<Result<{ success: boolean; message: string }>> => {
  try {
    const { amount, court_date, ...restUpdateData } = body;
    const dataToUpdate: Partial<SelectPracticeClientIntake> = {
      ...restUpdateData,
      ...(typeof amount !== 'undefined' && { amount }),
      ...(court_date && { court_date: new Date(court_date) }),
    };

    if (Object.keys(dataToUpdate).length === 0) {
      return result.badRequest('No fields to update provided.');
    }

    const existingIntake = await practiceClientIntakesRepository.findById(uuid);
    if (!existingIntake) {
      return result.notFound(`Practice client intake with UUID '${uuid}' not found`);
    }

    await practiceClientIntakesRepository.update(uuid, dataToUpdate);

    return result.ok({ success: true, message: 'Intake updated successfully.' });
  } catch (error) {
    logger.error('Failed to update practice client intake for {uuid}: {error}', { error, uuid });
    return result.internalError('Failed to update practice client intake');
  }
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

    const applicationFeeAmount = fundRouterService.calculateApplicationFee(practiceClientIntake.amount);

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
        ...(applicationFeeAmount && {
          application_fee_amount: applicationFeeAmount,
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

    return result.ok({
      success: true,
      data: formatIntakeResponse(practiceClientIntake, { requestingUserId }) as PracticeClientIntakeStatus['data'],
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

    // Fetch intake redirect path from app config
    const intakeRedirectUrl = await appConfigService.get<string>('intake_redirect_url');
    const redirectPath = intakeRedirectUrl || 'auth/accept-invitation';
    const separator = redirectPath.includes('?') ? '&' : '?';

    await auth.api.signInMagicLink({
      body: {
        email: metadata.email,
        callbackURL: `${getMatchingFrontendUrl(requestHeaders.get('origin'))}/${redirectPath}${separator}data=${encodedData}`,
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

/**
 * List practice client intakes with filtering and pagination
 */
const parseValidDate = (value: string): Date | null => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const listIntakes = async (
  organizationId: string,
  query: {
    status?: string;
    page: number;
    limit: number;
    search?: string;
    from?: string;
    to?: string;
    intake_id?: string;
  },
): Promise<PaginatedResultWithMeta<
  NonNullable<z.infer<typeof intakeValidations.listIntakesResponseSchema>['data']>['intakes'][number],
  'intakes'
>> => {
  try {
    if (query.from && !parseValidDate(query.from)) {
      return result.badRequest('Invalid date: from');
    }
    if (query.to && !parseValidDate(query.to)) {
      return result.badRequest('Invalid date: to');
    }
    const { intakes, total } = await practiceClientIntakesRepository.findByOrganizationId({
      organizationId,
      ...query,
      intakeId: query.intake_id,
    });

    const total_pages = Math.ceil(total / query.limit);

    const formattedIntakes = intakes.map((intake) => formatIntakeResponse(intake, { isAdmin: true }));

    return result.ok({
      intakes: formattedIntakes,
      total,
      page: query.page,
      limit: query.limit,
      total_pages,
    });
  } catch (error) {
    logger.error('Failed to list intakes for organization {organizationId}: {error}', {
      organizationId,
      error,
    });
    return result.internalError('Failed to list intakes');
  }
};

/**
 * Convert a completed intake to a Matter
 */
const convertIntakeToMatter = async (
  uuid: string,
  organizationId: string,
  data: {
    title?: string;
    responsible_attorney_id?: string;
    practice_service_id?: string;
  },
): Promise<Result<{ matter_id: string }>> => {
  try {
    const intake = await practiceClientIntakesRepository.findById(uuid);

    if (!intake) {
      return result.notFound('Intake not found');
    }

    if (intake.organization_id !== organizationId) {
      return result.forbidden('Access denied');
    }

    if (intake.status === 'converted') {
      const existingMatter = await mattersQueries.findByIntakeUuid(uuid);
      if (existingMatter) {
        return result.ok({ matter_id: existingMatter.id });
      }
      return result.conflict('Intake is marked as converted but no associated matter was found');
    }

    if (intake.status !== 'succeeded') {
      return result.badRequest('Only successful intakes can be converted to matters');
    }

    const metadata = intake.metadata as PracticeClientIntakeMetadata | null;
    if (!metadata) {
      return result.badRequest('Intake metadata is missing');
    }

    const matterId = await db.transaction(async (tx) => {
      // 1. Verify client_id exists in user_details if provided
      let clientId: string | undefined = undefined;
      if (metadata.user_id) {
        const userDetailsRecord = await userDetailsRepository.findById(metadata.user_id);
        if (userDetailsRecord) {
          clientId = metadata.user_id;
        } else {
          logger.warn('User ID {userId} from intake metadata not found in user_details, creating matter without client_id', {
            userId: metadata.user_id,
            intakeUuid: uuid,
          });
        }
      }

      // 2. Create Matter
      const matter = await mattersQueries.createMatter({
        organization_id: organizationId,
        billing_type: 'fixed', // Default for intake matters
        client_id: clientId,
        title: data.title ?? `Intake: ${metadata.name}`,
        description: metadata.description,
        status: 'intake_pending',
        urgency: intake.urgency ?? 'routine',
        intake_uuid: uuid,
        conversation_id: intake.conversation_id,
        on_behalf_of: metadata.on_behalf_of,
        opposing_party: metadata.opposing_party,
        opposing_counsel: metadata.opposing_counsel,
        responsible_attorney_id: data.responsible_attorney_id,
        practice_service_id: data.practice_service_id,
      }, tx);

      // 3. Update Intake Status
      await practiceClientIntakesRepository.updateStatus(uuid, 'converted', tx);

      return matter.id;
    });

    return result.ok({ matter_id: matterId });
  } catch (error) {
    logger.error('Failed to convert intake {uuid} to matter: {error}', {
      uuid,
      error,
    });
    return result.internalError('Failed to convert intake to matter');
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
  listIntakes,
  convertIntakeToMatter,
};
