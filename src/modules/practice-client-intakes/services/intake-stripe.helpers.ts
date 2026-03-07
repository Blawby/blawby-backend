import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';

import type { CreateIntakeCheckoutSessionParams, CreateIntakePaymentLinkParams } from '@/modules/practice-client-intakes/types/intake-stripe.types';
import { getMatchingFrontendUrl } from '@/shared/utils/env';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['practice-client-intakes', 'helpers', 'stripe']);

export const createIntakePaymentLink = async (
  params: CreateIntakePaymentLinkParams,
): Promise<Stripe.Response<Stripe.PaymentLink>> => {
  const {
    organization, connectedAccountStripeId, intakeUuid, request,
  } = params;

  const conversationParam = request.conversation_id
    ? `&conversation_id=${encodeURIComponent(request.conversation_id)}`
    : '';

  try {
    return await stripe.paymentLinks.create({
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
      on_behalf_of: connectedAccountStripeId,
      // Transfer funds to connected account (destination charges)
      transfer_data: {
        destination: connectedAccountStripeId,
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
          intake_uuid: intakeUuid,
          ...(request.address && { address: JSON.stringify(request.address) }),
          ...(request.user_id && { user_id: request.user_id }),
        },
      },
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${getMatchingFrontendUrl(request.origin)}/pay?uuid=${intakeUuid}&return_to=/p/${organization.slug}${conversationParam}`,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to create Stripe Payment Link', { error, intakeUuid, organizationId: organization.id });
    throw error;
  }
};


export const createIntakeCheckoutSession = async (
  params: CreateIntakeCheckoutSessionParams,
): Promise<Stripe.Checkout.Session> => {
  const {
    organization, connectedAccountStripeId, intake, request,
  } = params;

  const metadata: Record<string, string> = {
    intake_uuid: intake.id,
    organization_id: organization.id,
  };

  if (intake.metadata?.email) metadata.email = intake.metadata.email;
  if (intake.metadata?.name) metadata.name = intake.metadata.name;
  if (intake.metadata?.phone) metadata.phone = intake.metadata.phone;
  if (intake.metadata?.on_behalf_of) metadata.on_behalf_of = intake.metadata.on_behalf_of;
  if (intake.metadata?.opposing_party) metadata.opposing_party = intake.metadata.opposing_party;
  if (intake.metadata?.description) metadata.description = intake.metadata.description;
  if (intake.conversation_id) metadata.conversation_id = intake.conversation_id;
  if (request.user_id) metadata.user_id = request.user_id;

  const conversationParam: string = intake.conversation_id
    ? `&conversation_id=${encodeURIComponent(intake.conversation_id)}`
    : '';

  try {
    return await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: intake.id,
      success_url: `${getMatchingFrontendUrl(request.origin)}/pay?session_id={CHECKOUT_SESSION_ID}&return_to=/p/${organization.slug}${conversationParam}`,
      cancel_url: `${getMatchingFrontendUrl(request.origin)}/pay?session_id={CHECKOUT_SESSION_ID}&return_to=/p/${organization.slug}&canceled=true${conversationParam}`,
      line_items: [
        {
          price_data: {
            currency: intake.currency,
            product_data: {
              name: `Client Intake - ${organization.name}`,
              description: intake.metadata?.description || 'Legal consultation payment',
            },
            unit_amount: intake.amount,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        transfer_data: {
          destination: connectedAccountStripeId,
        },
        metadata,
      },
      metadata,
    });
  } catch (error) {
    logger.error('Failed to create Stripe Checkout Session', { error, intakeUuid: intake.id });
    throw error;
  }
};

export const retrieveCheckoutSession = async (
  sessionId: string,
): Promise<Stripe.Checkout.Session> => {
  try {
    return await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    logger.error('Failed to retrieve Stripe Checkout Session {sessionId}', { sessionId, error });
    throw error;
  }
};
