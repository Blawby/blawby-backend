/**
 * Intake Payments Service
 *
 * Handles intake payment creation, confirmation, and processing
 * Implements direct payment functionality for client intake
 */

import { eq } from 'drizzle-orm';
import type {
  OrganizationIntakeSettings,
  CreateIntakePaymentRequest,
  CreateIntakePaymentResponse,
  UpdateIntakePaymentResponse,
  IntakePaymentStatus,
} from '../types/intake-payments.types';
import { intakePaymentsRepository } from '@/modules/intake-payments/database/queries/intake-payments.repository';
import type {
  InsertIntakePayment,
} from '@/modules/intake-payments/database/schema/intake-payments.schema';
import { stripeConnectedAccountsRepository } from '@/modules/onboarding/database/queries/connected-accounts.repository';
import { organizations } from '@/schema';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { stripe } from '@/shared/utils/stripe-client';


/**
 * Create intake payments service
 */
export const createIntakePaymentsService = (
): {
  getOrganizationIntakeSettings(slug: string): Promise<OrganizationIntakeSettings>;
  createIntakePayment(request: CreateIntakePaymentRequest): Promise<CreateIntakePaymentResponse>;
  updateIntakePayment(ulid: string, amount: number): Promise<UpdateIntakePaymentResponse>;
  getIntakePaymentStatus(ulid: string): Promise<IntakePaymentStatus>;
} => {
  return {
    /**
     * Get organization intake settings by slug
     */
    async getOrganizationIntakeSettings(
      slug: string,
    ): Promise<OrganizationIntakeSettings> {
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
     * Create a new intake payment
     */
    async createIntakePayment(
      request: CreateIntakePaymentRequest,
    ): Promise<CreateIntakePaymentResponse> {
      try {
        // 1. Get organization intake settings
        const settings = await this.getOrganizationIntakeSettings(request.slug);
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
            on_behalf_of: request.onBehalfOf || '',
            description: request.description || '',
            organization_id: organization.id,
          },
          receipt_email: request.email,
        });

        // 5. Store intake payment in database
        const intakePaymentData: InsertIntakePayment = {
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
            onBehalfOf: request.onBehalfOf,
            description: request.description,
          },
          customerIp: request.customerIp,
          userAgent: request.userAgent,
        };

        const intakePayment = await intakePaymentsRepository.create(intakePaymentData);

        // 6. Publish intake payment created event
        void publishSimpleEvent(EventType.INTAKE_PAYMENT_CREATED, 'organization', organization.id, {
          intake_payment_id: intakePayment.id,
          ulid: intakePayment.ulid,
          stripe_payment_intent_id: stripePaymentIntent.id,
          amount: request.amount,
          currency: 'usd',
          customer_email: request.email,
          customer_name: request.name,
          created_at: new Date().toISOString(),
        });

        return {
          success: true,
          data: {
            ulid: intakePayment.ulid,
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
        console.error({ error }, 'Failed to create intake payment');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    /**
     * Update intake payment amount before confirmation
     */
    async updateIntakePayment(
      ulid: string,
      amount: number,
    ): Promise<UpdateIntakePaymentResponse> {
      try {
        // 1. Find intake payment by ULID
        const intakePayment = await intakePaymentsRepository.findByUlid(ulid);
        if (!intakePayment) {
          return {
            success: false,
            error: 'Intake payment not found',
          };
        }

        // 2. Validate status allows updates
        if (intakePayment.status === 'succeeded' || intakePayment.status === 'canceled') {
          return {
            success: false,
            error: 'Cannot update payment that has already been processed',
          };
        }

        // 3. Get connected account
        const connectedAccount = await stripeConnectedAccountsRepository.findById(
          intakePayment.connectedAccountId,
        );
        if (!connectedAccount) {
          return {
            success: false,
            error: 'Connected account not found',
          };
        }

        // 4. Update payment intent on Stripe
        const stripePaymentIntent = await stripe.paymentIntents.update(
          intakePayment.stripePaymentIntentId,
          {
            amount,
          },
          {
            stripeAccount: connectedAccount.stripe_account_id,
          },
        );

        // 5. Update intake payment in database
        await intakePaymentsRepository.update(intakePayment.id, {
          amount,
          status: stripePaymentIntent.status,
        });

        return {
          success: true,
          data: {
            ulid: intakePayment.ulid,
            clientSecret: stripePaymentIntent.client_secret!,
            amount,
            currency: intakePayment.currency,
            status: stripePaymentIntent.status,
          },
        };
      } catch (error) {
        console.error({ error }, 'Failed to update intake payment');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    /**
     * Get intake payment status by ULID
     */
    async getIntakePaymentStatus(
      ulid: string,
    ): Promise<IntakePaymentStatus> {
      try {
        const intakePayment = await intakePaymentsRepository.findByUlid(ulid);
        if (!intakePayment) {
          return {
            success: false,
            error: 'Intake payment not found',
          };
        }

        return {
          success: true,
          data: {
            ulid: intakePayment.ulid,
            amount: intakePayment.amount,
            currency: intakePayment.currency,
            status: intakePayment.status,
            stripeChargeId: intakePayment.stripeChargeId || undefined,
            metadata: intakePayment.metadata as {
              email: string;
              name: string;
              phone?: string;
              onBehalfOf?: string;
              description?: string;
            },
            succeededAt: intakePayment.succeededAt || undefined,
            createdAt: intakePayment.createdAt,
          },
        };
      } catch (error) {
        console.error({ error }, 'Failed to get intake payment status');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };
};
