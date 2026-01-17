/**
 * Practice Client Intakes Service
 *
 * Handles practice client intake payment creation, confirmation, and processing
 * Implements direct payment functionality for client intake
 */

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
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { stripeConnectedAccountsRepository } from '@/modules/onboarding/database/queries/connected-accounts.repository';
import { organizations } from '@/schema';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishEventTx } from '@/shared/events/event-publisher';
import { ORGANIZATION_ACTOR_UUID } from '@/shared/events/constants';
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
    console.error('Failed to get organization intake settings', { error, slug });
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

    // 3. Create payment intent on Stripe with transfer_data
    const stripePaymentIntent = await stripe.paymentIntents.create({
      amount: request.amount,
      currency: 'usd',
      transfer_data: {
        destination: connectedAccountDetails.stripe_account_id,
      },
      payment_method_types: ['card', 'us_bank_account'],
      payment_method_options: {
        us_bank_account: {
          financial_connections: {
            permissions: ['payment_method', 'balances'],
          },
        },
      },
      metadata: {
        email: request.email,
        name: request.name,
        phone: request.phone || '',
        on_behalf_of: request.on_behalf_of || '',
        opposing_party: request.opposing_party || '',
        description: request.description || '',
        organization_id: organization.id,
      },
      receipt_email: request.email,
    });

    // 4. Store practice client intake in database within transaction with event publishing
    // Note: Stripe API call is external, so it's outside the transaction
    const practiceClientIntake = await db.transaction(async (tx) => {
      // Schema requires stripePaymentLinkId, but we're using Payment Intents
      // Use payment intent ID as a placeholder for now (schema migration needed)
      const practiceClientIntakeData: InsertPracticeClientIntake = {
        organizationId: organization.id,
        connectedAccountId: connectedAccountDetails.id,
        stripePaymentLinkId: `pi_${stripePaymentIntent.id}`, // Temporary: schema requires this
        stripePaymentIntentId: stripePaymentIntent.id,
        amount: request.amount,
        currency: 'usd',
        status: stripePaymentIntent.status as string,
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

      const [intake] = await tx
        .insert(practiceClientIntakes)
        .values(practiceClientIntakeData)
        .returning();

      // Publish practice client intake created event within transaction
      await publishEventTx(tx, {
        type: EventType.INTAKE_PAYMENT_CREATED,
        actorId: ORGANIZATION_ACTOR_UUID,
        actorType: 'api',
        organizationId: organization.id,
        payload: {
          intake_payment_id: intake.id,
          uuid: intake.id,
          stripe_payment_intent_id: stripePaymentIntent.id,
          amount: request.amount,
          currency: 'usd',
          client_email: request.email,
          client_name: request.name,
          created_at: new Date().toISOString(),
        },
      });

      return intake;
    });

    // Return response matching the expected type structure
    // Note: Using clientSecret for Payment Intent, but type expects paymentLinkUrl
    // This should be updated when types are migrated to Payment Intent
    return {
      success: true,
      data: {
        uuid: practiceClientIntake.id,
        paymentLinkUrl: '', // Payment Intent doesn't have a URL, client uses clientSecret
        amount: request.amount,
        currency: 'usd',
        status: practiceClientIntake.status,
        organization: {
          name: organization.name,
          logo: organization.logo,
        },
      },
    };
  } catch (error) {
    console.error('Failed to create practice client intake', { error, slug: request.slug });
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
    console.error('Failed to get practice client intake status', { error, uuid });
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
