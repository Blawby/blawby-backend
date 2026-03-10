import type { Stripe } from 'stripe';
import type { z } from 'zod';
import { getMatchingFrontendUrl } from '@/shared/utils/env';
import { stripe } from '@/shared/utils/stripe-client';
import type { addressSchema } from '@/shared/validations/address';

export type CreateIntakePaymentLinkParams = {
  amount: number;
  currency?: string;
  description?: string;
  email: string;
  name: string;
  phone?: string | null;
  on_behalf_of?: string | null;
  opposing_party?: string | null;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  intakeId: string;
  stripeAccountId: string;
  origin?: string | null;
  conversationId?: string | null;
  address?: z.infer<typeof addressSchema>;
  userId?: string | null;
};

export const createIntakePaymentLink = async (
  params: CreateIntakePaymentLinkParams,
): Promise<Stripe.Response<Stripe.PaymentLink>> => {
  const conversationParam = params.conversationId
    ? `&conversation_id=${encodeURIComponent(params.conversationId)}`
    : '';

  return stripe.paymentLinks.create({
    line_items: [
      {
        price_data: {
          currency: params.currency || 'usd',
          product_data: {
            name: `Client Intake - ${params.organizationName}`,
            description: params.description || 'Legal consultation payment',
          },
          unit_amount: params.amount,
        },
        quantity: 1,
      },
    ],
    on_behalf_of: params.stripeAccountId,
    transfer_data: {
      destination: params.stripeAccountId,
    },
    payment_intent_data: {
      metadata: {
        email: params.email,
        name: params.name,
        phone: params.phone || '',
        on_behalf_of: params.on_behalf_of || '',
        opposing_party: params.opposing_party || '',
        description: params.description || '',
        organization_id: params.organizationId,
        intake_uuid: params.intakeId,
        ...(params.address ? { address: JSON.stringify(params.address) } : {}),
        ...(params.userId ? { user_id: params.userId } : {}),
      },
    },
    after_completion: {
      type: 'redirect',
      redirect: {
        url: `${getMatchingFrontendUrl(params.origin)}/pay?uuid=${params.intakeId}&return_to=/p/${params.organizationSlug}${conversationParam}`,
      },
    },
  });
};

export type CreateIntakeSessionParams = {
  currency: string;
  amount: number;
  email?: string;
  name?: string;
  phone?: string | null;
  on_behalf_of?: string | null;
  opposing_party?: string | null;
  description?: string | null;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  intakeId: string;
  stripeAccountId: string;
  origin?: string | null;
  conversationId?: string | null;
  userId?: string | null;
};

export const createIntakeCheckoutSession = async (
  params: CreateIntakeSessionParams,
): Promise<Stripe.Response<Stripe.Checkout.Session>> => {
  const metadata: Record<string, string> = {
    intake_uuid: params.intakeId,
    organization_id: params.organizationId,
  };

  if (params.email) metadata.email = params.email;
  if (params.name) metadata.name = params.name;
  if (params.phone) metadata.phone = params.phone;
  if (params.on_behalf_of) metadata.on_behalf_of = params.on_behalf_of;
  if (params.opposing_party) metadata.opposing_party = params.opposing_party;
  if (params.description) metadata.description = params.description;
  if (params.conversationId) metadata.conversation_id = params.conversationId;
  if (params.userId) metadata.user_id = params.userId;

  const conversationParam = params.conversationId
    ? `&conversation_id=${encodeURIComponent(params.conversationId)}`
    : '';

  return stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: params.intakeId,
    success_url: `${getMatchingFrontendUrl(params.origin)}/pay?session_id={CHECKOUT_SESSION_ID}&return_to=/p/${params.organizationSlug}${conversationParam}`,
    cancel_url: `${getMatchingFrontendUrl(params.origin)}/pay?session_id={CHECKOUT_SESSION_ID}&return_to=/p/${params.organizationSlug}&canceled=true${conversationParam}`,
    line_items: [
      {
        price_data: {
          currency: params.currency,
          product_data: {
            name: `Client Intake - ${params.organizationName}`,
            description: params.description || 'Legal consultation payment',
          },
          unit_amount: params.amount,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      on_behalf_of: params.stripeAccountId,
      transfer_data: {
        destination: params.stripeAccountId,
      },
      metadata,
    },
    metadata,
  });
};
