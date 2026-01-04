/**
 * Payments Service
 *
 * Handles payment intent creation, confirmation, and processing
 * Implements direct payment functionality (payment intents)
 */

import { stripeConnectedAccountsRepository } from '@/modules/onboarding/database/queries/connected-accounts.repository';
import { paymentIntentsRepository } from '@/modules/payments/database/queries/payment-intents.repository';
import type {
  InsertPaymentIntent,
  SelectPaymentIntent,
} from '@/modules/payments/database/schema/payment-intents.schema';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { calculateFees } from '@/shared/services/fees.service';
import { stripe } from '@/shared/utils/stripe-client';

export interface CreatePaymentIntentRequest {
  organizationId: string;
  customerId?: string;
  amount: number; // in cents
  currency?: string;
  applicationFeeAmount?: number; // in cents
  paymentMethodTypes?: string[];
  customerEmail?: string;
  customerName?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePaymentIntentResponse {
  success: boolean;
  paymentIntent?: {
    id: string;
    stripePaymentIntentId: string;
    clientSecret: string;
    amount: number;
    status: string;
  };
  error?: string;
}

export interface ConfirmPaymentRequest {
  paymentIntentId: string;
  organizationId: string;
  paymentMethodId?: string;
}

export interface ConfirmPaymentResponse {
  success: boolean;
  paymentIntent?: {
    id: string;
    status: string;
    chargeId?: string;
  };
  error?: string;
}

/**
 * Create payments service
 */
export const createPaymentsService = function createPaymentsService(
): {
  createPaymentIntent(
    request: CreatePaymentIntentRequest): Promise<CreatePaymentIntentResponse>;
  confirmPayment(
    request: ConfirmPaymentRequest): Promise<ConfirmPaymentResponse>;
  getPaymentIntent(
    paymentIntentId: string,
    organizationId: string): Promise<unknown>;
  listPaymentIntents(organizationId: string, limit?: number): Promise<unknown>;
} {
  return {
    /**
     * Create a new payment intent
     */
    async createPaymentIntent(
      request: CreatePaymentIntentRequest,
    ): Promise<CreatePaymentIntentResponse> {
      try {
        // 1. Validate organization has connected account
        const connectedAccount
          = await stripeConnectedAccountsRepository.findByOrganizationId(
            request.organizationId,
          );

        if (!connectedAccount) {
          return {
            success: false,
            error: 'Organization does not have a connected Stripe account',
          };
        }

        // 2. Get client if provided (optional)
        // Note: Client lookup removed as clientsRepository doesn't exist
        // This can be re-implemented when client management is added

        // 3. Calculate application fee if not provided
        let applicationFeeAmount = request.applicationFeeAmount;
        if (!applicationFeeAmount) {
          // Calculate default fee (e.g., 2.9% + $0.30)
          const stripeFee = calculateFees(request.amount, 'card', 'US');
          applicationFeeAmount = Math.round(stripeFee * 0.1); // 10% of Stripe fee
        }

        // 4. Create payment intent on Stripe (direct charges)
        const stripePaymentIntent = await stripe.paymentIntents.create(
          {
            amount: request.amount,
            currency: request.currency || 'usd',
            customer: request.customerId,
            application_fee_amount: applicationFeeAmount,
            payment_method_types: request.paymentMethodTypes || ['card'],
            description: request.description,
            metadata: {
              organizationId: request.organizationId,
              ...request.metadata,
            },
            receipt_email: request.customerEmail,
          },
          {
            stripeAccount: connectedAccount.stripe_account_id,
          },
        );

        // 5. Store payment intent in database
        const paymentIntentData: InsertPaymentIntent = {
          connectedAccountId: connectedAccount.id,
          customerId: request.customerId,
          stripePaymentIntentId: stripePaymentIntent.id,
          amount: request.amount,
          currency: request.currency || 'usd',
          applicationFeeAmount,
          status: stripePaymentIntent.status,
          customerEmail: request.customerEmail,
          customerName: request.customerName,
          metadata: request.metadata as unknown,
        };

        const paymentIntent
          = await paymentIntentsRepository.create(paymentIntentData);

        // 6. Publish simple payment intent created event
        void publishSimpleEvent(EventType.PAYMENT_SESSION_CREATED, 'organization', request.organizationId, {
          payment_intent_id: paymentIntent.id,
          stripe_payment_intent_id: stripePaymentIntent.id,
          amount: request.amount,
          currency: request.currency || 'usd',
          customer_id: request.customerId,
          application_fee_amount: applicationFeeAmount,
          created_at: new Date().toISOString(),
        });

        return {
          success: true,
          paymentIntent: {
            id: paymentIntent.id,
            stripePaymentIntentId: stripePaymentIntent.id,
            clientSecret: stripePaymentIntent.client_secret!,
            amount: request.amount,
            status: stripePaymentIntent.status,
          },
        };
      } catch (error) {
        console.error({ error }, 'Failed to create payment intent');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    /**
     * Confirm a payment intent
     */
    async confirmPayment(
      request: ConfirmPaymentRequest,
    ): Promise<ConfirmPaymentResponse> {
      try {
        // 1. Get payment intent
        const paymentIntent = await paymentIntentsRepository.findById(
          request.paymentIntentId,
        );
        if (!paymentIntent) {
          return {
            success: false,
            error: 'Payment intent not found',
          };
        }

        // 2. Verify organization owns this payment intent
        const connectedAccount
          = await stripeConnectedAccountsRepository.findById(
            paymentIntent.connectedAccountId,
          );
        if (
          !connectedAccount
          || connectedAccount.organization_id !== request.organizationId
        ) {
          return {
            success: false,
            error: 'Unauthorized access to payment intent',
          };
        }

        // 3. Confirm payment intent on Stripe
        const stripePaymentIntent = await stripe.paymentIntents.confirm(
          paymentIntent.stripePaymentIntentId,
          {
            payment_method: request.paymentMethodId,
          },
          {
            stripeAccount: connectedAccount.stripe_account_id,
          },
        );

        // 4. Update payment intent status
        await paymentIntentsRepository.update(paymentIntent.id, {
          status: stripePaymentIntent.status,
          paymentMethodId: stripePaymentIntent.payment_method as string,
          stripeChargeId: stripePaymentIntent.latest_charge as string,
          succeededAt:
            stripePaymentIntent.status === 'succeeded' ? new Date() : undefined,
        });

        // 5. Publish simple payment intent confirmed event
        void publishSimpleEvent(EventType.PAYMENT_SUCCEEDED, 'organization', request.organizationId, {
          payment_intent_id: paymentIntent.id,
          stripe_payment_intent_id: stripePaymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: stripePaymentIntent.status,
          confirmed_at: new Date().toISOString(),
        });

        return {
          success: true,
          paymentIntent: {
            id: paymentIntent.id,
            status: stripePaymentIntent.status,
            chargeId: stripePaymentIntent.latest_charge as string,
          },
        };
      } catch (error) {
        console.error({ error }, 'Failed to confirm payment intent');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    /**
     * Get payment intent
     */
    async getPaymentIntent(
      paymentIntentId: string,
      organizationId: string,
    ): Promise<{
      success: boolean;
      paymentIntent?: SelectPaymentIntent;
      error?: string;
    }> {
      try {
        const paymentIntent
          = await paymentIntentsRepository.findById(paymentIntentId);
        if (!paymentIntent) {
          return {
            success: false,
            error: 'Payment intent not found',
          };
        }

        // Verify organization owns this payment intent
        const connectedAccount
          = await stripeConnectedAccountsRepository.findById(
            paymentIntent.connectedAccountId,
          );
        if (
          !connectedAccount
          || connectedAccount.organization_id !== organizationId
        ) {
          return {
            success: false,
            error: 'Unauthorized access to payment intent',
          };
        }

        return {
          success: true,
          paymentIntent,
        };
      } catch (error) {
        console.error({ error }, 'Failed to get payment intent');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    /**
     * List payment intents for organization
     */
    async listPaymentIntents(
      organizationId: string,
      limit = 50,
      offset = 0,
    ): Promise<{
      success: boolean;
      paymentIntents?: SelectPaymentIntent[];
      error?: string;
    }> {
      try {
        // Get connected account
        const connectedAccount
          = await stripeConnectedAccountsRepository.findByOrganizationId(
            organizationId,
          );
        if (!connectedAccount) {
          return {
            success: false,
            error: 'Organization does not have a connected Stripe account',
          };
        }

        const paymentIntents
          = await paymentIntentsRepository.listByConnectedAccountId(
            connectedAccount.id,
            limit,
            offset,
          );

        return {
          success: true,
          paymentIntents,
        };
      } catch (error) {
        console.error({ error }, 'Failed to list payment intents');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    // Commented out - not in interface
    /*
    async cancelPaymentIntent(
      paymentIntentId: string,
      organizationId: string): Promise<{
      success: boolean;
      error?: string;
    }> {
      try {
        // 1. Get payment intent
        const paymentIntent =
          await paymentIntentsRepository.findById(paymentIntentId);
        if (!paymentIntent) {
          return {
            success: false,
            error: 'Payment intent not found',
          };
        }

        // 2. Verify organization owns this payment intent
        const connectedAccount =
          await stripeConnectedAccountsRepository.findById(
            paymentIntent.connectedAccountId);
        if (
          !connectedAccount ||
          connectedAccount.organization_id !== organizationId
        ) {
          return {
            success: false,
            error: 'Unauthorized access to payment intent',
          };
        }

        // 3. Cancel payment intent on Stripe
        await stripe.paymentIntents.cancel(
          paymentIntent.stripePaymentIntentId,
          {},
          {
            stripeAccount: connectedAccount.stripe_account_id,
          });

        // 4. Update payment intent status
        await paymentIntentsRepository.update(paymentIntent.id, {
          status: 'canceled',
        });

        // 5. Publish simple payment intent canceled event
        void publishSimpleEvent(EventType.PAYMENT_CANCELED, 'organization', organizationId, {
          payment_intent_id: paymentIntent.id,
          stripe_payment_intent_id: paymentIntent.stripePaymentIntentId,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          canceled_at: new Date().toISOString(),
        });

        return { success: true };
      } catch (error) {
        console.error({ error }, 'Failed to cancel payment intent');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
    */
  };
};
