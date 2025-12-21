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
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { stripeConnectedAccountsRepository } from '@/modules/onboarding/database/queries/connected-accounts.repository';
import { organizations } from '@/schema';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { stripe } from '@/shared/utils/stripe-client';


/**
 * Create practice client intakes service
 */
export const createPracticeClientIntakesService = (
): {
  getPracticeClientIntakeSettings(slug: string): Promise<PracticeClientIntakeSettings>;
  createPracticeClientIntake(request: CreatePracticeClientIntakeRequest): Promise<CreatePracticeClientIntakeResponse>;
  updatePracticeClientIntake(uuid: string, amount: number): Promise<UpdatePracticeClientIntakeResponse>;
  getPracticeClientIntakeStatus(uuid: string): Promise<PracticeClientIntakeStatus>;
} => {
  return {
    /**
     * Get practice client intake settings by slug
     */
    async getPracticeClientIntakeSettings(
      slug: string,
    ): Promise<PracticeClientIntakeSettings> {
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

        // 2. Check if payment links are enabled
        if (!organization.paymentLinkEnabled) {
          return {
            success: false,
            error: 'Payment links are not enabled for this organization',
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
              paymentLinkEnabled: organization.paymentLinkEnabled,
              prefillAmount: organization.paymentLinkPrefillAmount || 0,
            },
            connectedAccount: {
              id: connectedAccount.id,
              chargesEnabled: connectedAccount.charges_enabled,
            },
          },
        };
      } catch (error) {
        console.error({ error }, 'Failed to get organization intake settings');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    /**
     * Create a new practice client intake
     */
    async createPracticeClientIntake(
      request: CreatePracticeClientIntakeRequest,
    ): Promise<CreatePracticeClientIntakeResponse> {
      try {
        // 1. Get practice client intake settings
        const settings = await this.getPracticeClientIntakeSettings(request.slug);
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

        // 5. Store practice client intake in database
        const practiceClientIntakeData: InsertPracticeClientIntake = {
          organizationId: organization.id,
          connectedAccountId: connectedAccountDetails.id,
          stripePaymentIntentId: stripePaymentIntent.id,
          amount: request.amount,
          currency: 'usd',
          status: stripePaymentIntent.status,
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
          stripe_payment_intent_id: stripePaymentIntent.id,
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
            clientSecret: stripePaymentIntent.client_secret!,
            amount: request.amount,
            currency: 'usd',
            status: stripePaymentIntent.status,
            organization: {
              name: organization.name,
              logo: organization.logo,
            },
          },
        };
      } catch (error) {
        console.error({ error }, 'Failed to create practice client intake');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    /**
     * Update practice client intake amount before confirmation
     */
    async updatePracticeClientIntake(
      uuid: string,
      amount: number,
    ): Promise<UpdatePracticeClientIntakeResponse> {
      try {
        // 1. Find practice client intake by UUID
        const practiceClientIntake = await practiceClientIntakesRepository.findById(uuid);
        if (!practiceClientIntake) {
          return {
            success: false,
            error: 'Practice client intake not found',
          };
        }

        // 2. Validate status allows updates
        if (practiceClientIntake.status === 'succeeded' || practiceClientIntake.status === 'canceled') {
          return {
            success: false,
            error: 'Cannot update payment that has already been processed',
          };
        }

        // 3. Get connected account
        const connectedAccount = await stripeConnectedAccountsRepository.findById(
          practiceClientIntake.connectedAccountId,
        );
        if (!connectedAccount) {
          return {
            success: false,
            error: 'Connected account not found',
          };
        }

        // 4. Update payment intent on Stripe
        const stripePaymentIntent = await stripe.paymentIntents.update(
          practiceClientIntake.stripePaymentIntentId,
          {
            amount,
          },
          {
            stripeAccount: connectedAccount.stripe_account_id,
          },
        );

        // 5. Update practice client intake in database
        await practiceClientIntakesRepository.update(practiceClientIntake.id, {
          amount,
          status: stripePaymentIntent.status,
        });

        return {
          success: true,
          data: {
            uuid: practiceClientIntake.id,
            clientSecret: stripePaymentIntent.client_secret!,
            amount,
            currency: practiceClientIntake.currency,
            status: stripePaymentIntent.status,
          },
        };
      } catch (error) {
        console.error({ error }, 'Failed to update practice client intake');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    /**
     * Get practice client intake status by UUID
     */
    async getPracticeClientIntakeStatus(
      uuid: string,
    ): Promise<PracticeClientIntakeStatus> {
      try {
        const practiceClientIntake = await practiceClientIntakesRepository.findById(uuid);
        if (!practiceClientIntake) {
          return {
            success: false,
            error: 'Practice client intake not found',
          };
        }

        return {
          success: true,
          data: {
            uuid: practiceClientIntake.id,
            amount: practiceClientIntake.amount,
            currency: practiceClientIntake.currency,
            status: practiceClientIntake.status,
            stripeChargeId: practiceClientIntake.stripeChargeId || undefined,
            metadata: practiceClientIntake.metadata as {
              email: string;
              name: string;
              phone?: string;
              onBehalfOf?: string;
              opposingParty?: string;
              description?: string;
            },
            succeededAt: practiceClientIntake.succeededAt || undefined,
            createdAt: practiceClientIntake.createdAt,
          },
        };
      } catch (error) {
        console.error({ error }, 'Failed to get practice client intake status');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };
};
