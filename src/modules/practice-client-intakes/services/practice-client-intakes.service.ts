/**
 * Practice Client Intakes Service
 *
 * Handles practice client intake payment creation, confirmation, and processing
 * Implements direct payment functionality for client intake
 */

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type {
  PracticeClientIntakeSettings,
  CreatePracticeClientIntakeRequest,
  CreatePracticeClientIntakeResponse,
  UpdatePracticeClientIntakeResponse,
  PracticeClientIntakeStatus,
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type {
  InsertPracticeClientIntake,
  PracticeClientIntakeMetadata,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import {
  practiceClientIntakeMetadataSchema,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { stripeConnectedAccountsRepository } from '@/modules/onboarding/database/queries/connected-accounts.repository';
import { organizations } from '@/schema';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { hashEmail, logError } from '@/shared/utils/logging';
import { stripe } from '@/shared/utils/stripe-client';

/**
 * Get practice client intake settings by slug
 */
const getPracticeClientIntakeSettings = async (
  slug: string,
): Promise<PracticeClientIntakeSettings> => {
  try {
    // 1. Find organization by slug
    const organization = await db.query.organizations.findFirst({
      where: eq(organizations.slug, slug),
    });

    if (!organization) {
      return {
        success: false,
        error: 'Organization not found',
      };
    }

    // 3. Get connected account
    const connectedAccount = await stripeConnectedAccountsRepository.findByOrganizationId(
      organization.id,
    );

    if (!connectedAccount) {
      return {
        success: false,
        error: 'Organization does not have a connected Stripe account',
      };
    }

    // 4. Validate connected account
    if (!connectedAccount.charges_enabled) {
      return {
        success: false,
        error: 'Connected account is not ready to accept payments',
      };
    }

    return {
      success: true,
      data: {
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
      },
    };
  } catch (error) {
    logError('Failed to get organization intake settings', error, { slug });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Create a new practice client intake
 */
const createPracticeClientIntake = async (
  request: CreatePracticeClientIntakeRequest,
): Promise<CreatePracticeClientIntakeResponse> => {
  try {
    // 1. Get practice client intake settings
    const settings = await getPracticeClientIntakeSettings(request.slug);
    if (!settings.success || !settings.data) {
      return {
        success: false,
        error: settings.error,
      };
    }

    const { organization } = settings.data;

    // 2. Get connected account details
    const connectedAccountDetails = await stripeConnectedAccountsRepository.findByOrganizationId(
      organization.id,
    );

    if (!connectedAccountDetails) {
      return {
        success: false,
        error: 'Connected account not found',
      };
    }

    const intakeId: string = randomUUID();

    // 3. Create Stripe Payment Link with destination charges
    // - transfer_data.destination routes funds to connected account
    // - on_behalf_of makes connected account the merchant of record (branding, statements)
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
      on_behalf_of: connectedAccountDetails.stripe_account_id,
      // Transfer funds to connected account (destination charges)
      transfer_data: {
        destination: connectedAccountDetails.stripe_account_id,
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
          url: `${process.env.FRONTEND_URL}/payment/complete?payment_link=${intakeId}`,
        },
      },
    });

    // 4. Store practice client intake in database
    const practiceClientIntakeData: InsertPracticeClientIntake = {
      id: intakeId,
      organizationId: organization.id,
      connectedAccountId: connectedAccountDetails.id,
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

    return {
      success: true,
      data: {
        uuid: practiceClientIntake.id,
        paymentLinkUrl: stripePaymentLink.url,
        amount: request.amount,
        currency: 'usd',
        status: 'open',
        organization: {
          name: organization.name,
          logo: organization.logo,
        },
      },
    };
  } catch (error) {
    logError('Failed to create practice client intake', error, {
      slug: request.slug,
      emailHash: hashEmail(request.email),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Update practice client intake amount
 * Note: Payment Links cannot be updated directly. This creates a new Payment Link with the updated amount.
 */
const updatePracticeClientIntake = async (
  uuid: string,
  amount: number,
): Promise<UpdatePracticeClientIntakeResponse> => {
  return {
    success: false,
    error: 'Updating practice client intakes is no longer supported. Create a new intake instead.',
  };
};

/**
 * Get practice client intake status by UUID
 */
const getPracticeClientIntakeStatus = async (
  uuid: string,
): Promise<PracticeClientIntakeStatus> => {
  try {
    const practiceClientIntake = await practiceClientIntakesRepository.findById(uuid);
    if (!practiceClientIntake) {
      return {
        success: false,
        error: 'Practice client intake not found',
      };
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

    return {
      success: true,
      data: {
        uuid: practiceClientIntake.id,
        amount: practiceClientIntake.amount,
        currency: practiceClientIntake.currency,
        status: practiceClientIntake.status,
        stripeChargeId: practiceClientIntake.stripeChargeId || undefined,
        metadata: metadata ?? undefined,
        succeededAt: practiceClientIntake.succeededAt || undefined,
        createdAt: practiceClientIntake.createdAt,
      },
    };
  } catch (error) {
    logError('Failed to get practice client intake status', error, { uuid });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

export const practiceClientIntakesService = {
  getPracticeClientIntakeSettings,
  createPracticeClientIntake,
  updatePracticeClientIntake,
  getPracticeClientIntakeStatus,
};
