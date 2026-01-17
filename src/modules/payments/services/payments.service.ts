/**
 * Payments Service
 *
 * Handles payment intent creation, confirmation, and processing
 * Implements direct payment functionality (payment intents)
 */

import { eq } from 'drizzle-orm';
import { stripeConnectedAccountsRepository } from '@/modules/onboarding/database/queries/connected-accounts.repository';
import { paymentIntentsRepository } from '@/modules/payments/database/queries/payment-intents.repository';
import type {
  SelectPaymentIntent,
} from '@/modules/payments/database/schema/payment-intents.schema';
import { paymentIntents } from '@/modules/payments/database/schema/payment-intents.schema';
import type {
  CreatePaymentIntentRequest,
  CreatePaymentIntentResponse,
  ConfirmPaymentRequest,
  ConfirmPaymentResponse,
  PaymentIntentStatus,
  PaymentIntentOwnershipResult,
  ServiceResponse,
} from '@/modules/payments/types/payments.types';
import { EventType } from '@/shared/events/enums/event-types';
import { publishEventTx } from '@/shared/events/event-publisher';
import { ORGANIZATION_ACTOR_UUID } from '@/shared/events/constants';
import { calculateFees } from '@/shared/services/fees.service';
import { db } from '@/shared/database';
import { stripe } from '@/shared/utils/stripe-client';

// Re-export types for external use
export type {
  CreatePaymentIntentRequest,
  CreatePaymentIntentResponse,
  ConfirmPaymentRequest,
  ConfirmPaymentResponse,
  PaymentIntentStatus,
  ServiceResponse,
} from '@/modules/payments/types/payments.types';

// Helper functions
const normalizePaymentIntentStatus = (
  status: string,
): PaymentIntentStatus => {
  // Explicit allow-list mapping for known Stripe payment intent statuses
  const validStatuses: Record<string, PaymentIntentStatus> = {
    requires_payment_method: 'requires_payment_method',
    requires_confirmation: 'requires_confirmation',
    requires_action: 'requires_action',
    processing: 'processing',
    requires_capture: 'requires_capture',
    canceled: 'canceled',
    succeeded: 'succeeded',
  };

  const normalized = validStatuses[status];
  if (!normalized) {
    console.warn(`[normalizePaymentIntentStatus] Unknown Stripe status: ${status}, defaulting to 'requires_action'`);
    return 'requires_action';
  }

  return normalized;
};

const verifyPaymentIntentOwnership = async (
  paymentIntentId: string,
  organizationId: string,
): Promise<PaymentIntentOwnershipResult> => {
  const paymentIntent = await paymentIntentsRepository.findById(paymentIntentId);
  if (!paymentIntent) {
    return {
      success: false,
      error: 'Payment intent not found',
    };
  }

  const connectedAccount = await stripeConnectedAccountsRepository.findById(
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
    connectedAccount,
  };
};

const handleServiceError = (
  error: unknown,
  context: string,
): { success: false; error: string } => {
  console.error({ error }, `Failed to ${context}`);
  return {
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error',
  };
};

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
    organizationId: string): Promise<ServiceResponse<SelectPaymentIntent>>;
  listPaymentIntents(organizationId: string, limit?: number): Promise<ServiceResponse<SelectPaymentIntent[]>>;
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

        // 5. Store payment intent in database within transaction with event publishing
        // Note: Stripe API call is external, so it's outside the transaction
        const paymentIntent = await db.transaction(async (tx) => {
          const status = normalizePaymentIntentStatus(stripePaymentIntent.status);

          const [intent] = await tx
            .insert(paymentIntents)
            .values({
              connectedAccountId: connectedAccount.id,
              customerId: request.customerId,
              stripePaymentIntentId: stripePaymentIntent.id,
              amount: request.amount,
              currency: request.currency || 'usd',
              applicationFeeAmount,
              status,
              customerEmail: request.customerEmail,
              customerName: request.customerName,
              metadata: request.metadata,
            })
            .returning();

          // Publish payment intent created event within transaction
          await publishEventTx(tx, {
            type: EventType.PAYMENT_SESSION_CREATED,
            actorId: ORGANIZATION_ACTOR_UUID,
            actorType: 'api',
            organizationId: request.organizationId,
            payload: {
              payment_intent_id: intent.id,
              stripe_payment_intent_id: stripePaymentIntent.id,
              amount: request.amount,
              currency: request.currency || 'usd',
              customer_id: request.customerId,
              application_fee_amount: applicationFeeAmount,
              created_at: new Date().toISOString(),
            },
          });

          return intent;
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
        return handleServiceError(error, 'create payment intent');
      }
    },

    /**
     * Confirm a payment intent
     */
    async confirmPayment(
      request: ConfirmPaymentRequest,
    ): Promise<ConfirmPaymentResponse> {
      try {
        // 1. Verify payment intent ownership
        const ownershipCheck = await verifyPaymentIntentOwnership(
          request.paymentIntentId,
          request.organizationId,
        );
        if (!ownershipCheck.success || !ownershipCheck.paymentIntent || !ownershipCheck.connectedAccount) {
          return {
            success: false,
            error: ownershipCheck.error || 'Payment intent not found',
          };
        }
        const { paymentIntent, connectedAccount } = ownershipCheck;

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

        // 4. Update payment intent status within transaction with event publishing
        // Note: Stripe API call is external, so it's outside the transaction
        await db.transaction(async (tx) => {
          const status = normalizePaymentIntentStatus(stripePaymentIntent.status);
          await tx
            .update(paymentIntents)
            .set({
              status,
              paymentMethodId: stripePaymentIntent.payment_method as string,
              stripeChargeId: stripePaymentIntent.latest_charge as string,
              succeededAt: status === 'succeeded' ? new Date() : undefined,
            })
            .where(eq(paymentIntents.id, paymentIntent.id));

          // Publish payment event within transaction based on actual status
          const eventType = stripePaymentIntent.status === 'succeeded'
            ? EventType.PAYMENT_SUCCEEDED
            : EventType.PAYMENT_RECEIVED;
          await publishEventTx(tx, {
            type: eventType,
            actorId: ORGANIZATION_ACTOR_UUID,
            actorType: 'api',
            organizationId: request.organizationId,
            payload: {
              payment_intent_id: paymentIntent.id,
              stripe_payment_intent_id: stripePaymentIntent.id,
              amount: paymentIntent.amount,
              currency: paymentIntent.currency,
              status: stripePaymentIntent.status,
              confirmed_at: new Date().toISOString(),
            },
          });
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
        return handleServiceError(error, 'confirm payment intent');
      }
    },

    /**
     * Get payment intent
     */
    async getPaymentIntent(
      paymentIntentId: string,
      organizationId: string,
    ): Promise<ServiceResponse<SelectPaymentIntent>> {
      try {
        const ownershipCheck = await verifyPaymentIntentOwnership(
          paymentIntentId,
          organizationId,
        );
        if (!ownershipCheck.success) {
          return ownershipCheck;
        }

        return {
          success: true,
          data: ownershipCheck.paymentIntent!,
        };
      } catch (error) {
        return handleServiceError(error, 'get payment intent');
      }
    },

    /**
     * List payment intents for organization
     */
    async listPaymentIntents(
      organizationId: string,
      limit = 50,
      offset = 0,
    ): Promise<ServiceResponse<SelectPaymentIntent[]>> {
      try {
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

        const paymentIntentsList
          = await paymentIntentsRepository.listByConnectedAccountId(
            connectedAccount.id,
            limit,
            offset,
          );

        return {
          success: true,
          data: paymentIntentsList,
        };
      } catch (error) {
        return handleServiceError(error, 'list payment intents');
      }
    },
  };
};
