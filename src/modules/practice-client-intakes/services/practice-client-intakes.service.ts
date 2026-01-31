import { randomUUID } from 'node:crypto';
import { getLogger } from '@logtape/logtape';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { isAccountActive } from '@/modules/onboarding/services/connected-accounts.service';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import {
  practiceClientIntakeMetadataSchema,
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
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { IntakePaymentCreated } from '@/shared/events/definitions';
import type { Result } from '@/shared/types/result';
import { result } from '@/shared/utils/result';
import { stripe } from '@/shared/utils/stripe-client';


const logger = getLogger(['practice-client-intakes', 'service']);

const {
  ok, internalError, fail, badRequest, notFound, forbidden,
} = result;

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
      return notFound(`Organization with slug '${slug}' not found`);
    }

    if (!organization.activeSubscriptionId) {
      return forbidden('Organization does not have an active subscription');
    }

    // 2. Get connected account
    const connectedAccount = await onboardingRepository.findByOrganizationId(organization.id);

    if (!connectedAccount) {
      return forbidden('Organization does not have a connected Stripe account');
    }

    // 3. Validate connected account
    if (!(await isAccountActive(connectedAccount))) {
      return forbidden('Connected account is not ready to accept payments');
    }

    return ok({
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
    return internalError('Failed to get organization intake settings');
  }
};

/**
 * Create a new practice client intake
 */
const createPracticeClientIntake = async (
  request: CreatePracticeClientIntakeRequest & { clientIp?: string; userAgent?: string },
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
      return fail('Connected account not found');
    }

    // user_id comes from authenticated session context (set by HTTP handler)
    // No need to validate - session context is trusted
    const validatedUserId = request.user_id;

    const intakeId: string = randomUUID();

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
          ...(validatedUserId && { user_id: validatedUserId }),
        },
      },

      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${process.env.FRONTEND_URL}/pay?uuid=${intakeId}&return_to=/p/${organization.slug}`,
        },
      },
    });

    // 4. Store practice client intake in database
    const practiceClientIntakeData: InsertPracticeClientIntake = {
      id: intakeId,
      organization_id: organization.id,
      connected_account_id: connectedAccount.id,
      stripe_payment_link_id: stripePaymentLink.id,
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
        ...(validatedUserId && { user_id: validatedUserId }),
      },
      client_ip: request.clientIp,
      user_agent: request.userAgent,
    };

    const practiceClientIntake = await practiceClientIntakesRepository.create(practiceClientIntakeData);

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

    return ok({
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
    return internalError('Failed to create practice client intake');
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
  return badRequest('Updating practice client intakes is no longer supported. Create a new intake instead.');
};


/**
 * Get practice client intake status by UUID
 */
const getPracticeClientIntakeStatus = async (
  uuid: string,
): Promise<Result<PracticeClientIntakeStatus>> => {
  try {
    const practiceClientIntake = await practiceClientIntakesRepository.findById(uuid);
    if (!practiceClientIntake) {
      return notFound(`Practice client intake with UUID '${uuid}' not found`);
    }

    // Validate and parse metadata if present
    let metadata: PracticeClientIntakeMetadata | null = null;
    if (practiceClientIntake.metadata) {
      try {
        metadata = practiceClientIntakeMetadataSchema.parse(practiceClientIntake.metadata);
      } catch (_parseError) {
        // If metadata doesn't match schema, return null
        metadata = null;
      }
    }

    return ok({
      success: true,
      data: {
        uuid: practiceClientIntake.id,
        organization_id: practiceClientIntake.organization_id,
        amount: practiceClientIntake.amount,
        currency: practiceClientIntake.currency,
        status: practiceClientIntake.status,
        stripe_charge_id: practiceClientIntake.stripe_charge_id || undefined,
        metadata: metadata ?? undefined,
        succeeded_at: practiceClientIntake.succeeded_at?.toISOString() || undefined,
        created_at: practiceClientIntake.created_at.toISOString(),
      },

    });
  } catch (error) {
    logger.error('Failed to get practice client intake status for {uuid}: {error}', { error, uuid });
    return internalError('Failed to get practice client intake status');
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
  _requestHeaders: Headers,
): Promise<Result<{ success: true; message: string }>> => {
  try {
    // 1. Get intake and verify ownership
    const intakeResult = await getPracticeClientIntakeStatus(uuid);

    if (!intakeResult.success || !intakeResult.data?.data) {
      return intakeResult as Result<never>;
    }

    const intakeData = intakeResult.data.data;
    const metadata = intakeData.metadata;

    if (metadata?.user_id !== sessionUserId) {
      return forbidden('You do not own this intake');
    }

    if (intakeData.status !== 'succeeded') {
      return badRequest('Payment must be completed before sending an invitation');
    }

    if (!metadata?.email) {
      return badRequest('No email address found in intake data');
    }

    // 2. Send magic link via Better Auth
    // When user clicks the link and authenticates, onLinkAccount hook
    // will check for pending intake and add them to the organization
    const auth = createBetterAuthInstance(db);

    await auth.api.signInMagicLink({
      body: {
        email: metadata.email,
        callbackURL: '/client/dashboard',
      },
      headers: new Headers(),
    });

    return ok({ success: true, message: 'Magic link sent to your email' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to send magic link for intake {uuid}: {error} {details}', {
      uuid,
      error: errorMessage,
      details: JSON.stringify(error, Object.getOwnPropertyNames(error)),
    });
    return internalError('An unexpected error occurred while sending the magic link');
  }
};


export const practiceClientIntakesService = {
  getPracticeClientIntakeSettings,
  createPracticeClientIntake,
  updatePracticeClientIntake,
  getPracticeClientIntakeStatus,
  triggerIntakeInvitation,
};

