import { getLogger } from '@logtape/logtape';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type {
  CreatePracticeClientIntakeRequest,
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type {
  InsertPracticeClientIntake,
  PracticeClientIntakeMetadata,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import {
  practiceClientIntakeMetadataSchema,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { isAccountActive } from '@/modules/onboarding/services/connected-accounts.service';
import { stripe } from '@/shared/utils/stripe-client';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { Result, ok, fail, badRequest, notFound, internalError } from '@/shared/types/result';

const logger = getLogger(['practice-client-intakes', 'service']);

/**
 * Get practice client intake settings by slug
 */
const getPracticeClientIntakeSettings = async (
  slug: string,
): Promise<Result<any>> => {
  try {
    // 1. Find organization by slug
    const organization = await organizationRepository.findBySlug(slug);

    if (!organization) {
      return notFound(`Organization with slug '${slug}' not found`);
    }

    // 2. Get connected account
    const connectedAccount = await onboardingRepository.findByOrganizationId(organization.id);

    if (!connectedAccount) {
      return fail('Organization does not have a connected Stripe account');
    }

    // 3. Validate connected account
    if (!isAccountActive(connectedAccount)) {
      return fail('Connected account is not ready to accept payments');
    }

    return ok({
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo ?? '',
      },
      settings: {
        paymentLinkEnabled: organization?.paymentLinkEnabled ?? false,
        prefillAmount: organization?.paymentLinkPrefillAmount ?? 0,
      },
      connectedAccount: {
        id: connectedAccount.id,
        chargesEnabled: connectedAccount.charges_enabled,
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
  request: CreatePracticeClientIntakeRequest,
): Promise<Result<any>> => {
  try {
    // 1. Get practice client intake settings
    const settingsResult = await getPracticeClientIntakeSettings(request.slug);
    if (!settingsResult.success) return settingsResult;

    const { organization } = settingsResult.data;

    // 2. Get connected account details
    const connectedAccount = await onboardingRepository.findByOrganizationId(organization.id);

    if (!connectedAccount) {
      return fail('Connected account not found');
    }

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
      organizationId: organization.id,
      connectedAccountId: connectedAccount.id,
      stripePaymentLinkId: stripePaymentLink.id,
      amount: request.amount,
      currency: 'usd',
      status: 'open', // Payment Link status: open, completed, expired
      metadata: {
        email: request.email,
        name: request.name,
        phone: request.phone,
        onBehalfOf: request.on_behalf_of,
        opposingParty: request.opposing_party,
        description: request.description,
      },
      clientIp: request.clientIp,
      userAgent: request.userAgent,
    };

    const practiceClientIntake = await practiceClientIntakesRepository.create(practiceClientIntakeData);

    // 6. Publish practice client intake created event
    void publishSimpleEvent(EventType.INTAKE_PAYMENT_CREATED, 'organization', organization.id, {
      intake_payment_id: practiceClientIntake.id,
      uuid: practiceClientIntake.id,
      stripe_payment_link_id: stripePaymentLink.id,
      amount: request.amount,
      currency: 'usd',
      client_email: request.email,
      client_name: request.name,
      created_at: new Date().toISOString(),
    });

    return ok({
      uuid: practiceClientIntake.id,
      paymentLinkUrl: stripePaymentLink.url,
      amount: request.amount,
      currency: 'usd',
      status: 'open',
      organization: {
        name: organization.name,
        logo: organization.logo,
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
): Promise<Result<any>> => {
  return badRequest('Updating practice client intakes is no longer supported. Create a new intake instead.');
};

/**
 * Get practice client intake status by UUID
 */
const getPracticeClientIntakeStatus = async (
  uuid: string,
): Promise<Result<any>> => {
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
      } catch (parseError) {
        // If metadata doesn't match schema, return null
        metadata = null;
      }
    }

    return ok({
      uuid: practiceClientIntake.id,
      amount: practiceClientIntake.amount,
      currency: practiceClientIntake.currency,
      status: practiceClientIntake.status,
      stripeChargeId: practiceClientIntake.stripeChargeId || undefined,
      metadata: metadata ?? undefined,
      succeededAt: practiceClientIntake.succeededAt || undefined,
      createdAt: practiceClientIntake.createdAt,
    });
  } catch (error) {
    logger.error('Failed to get practice client intake status for {uuid}: {error}', { error, uuid });
    return internalError('Failed to get practice client intake status');
  }
};

export const practiceClientIntakesService = {
  getPracticeClientIntakeSettings,
  createPracticeClientIntake,
  updatePracticeClientIntake,
  getPracticeClientIntakeStatus,
};
