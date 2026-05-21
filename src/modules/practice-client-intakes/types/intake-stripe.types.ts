import type { PracticeClientIntakeMetadata } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import type { Stripe } from 'stripe';
import type { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';

export interface CreateIntakePaymentLinkParams {
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  connectedAccountStripeId: string;
  intakeUuid: string;
  request: {
    amount: number;
    email: string;
    name: string;
    phone?: string;
    on_behalf_of?: string;
    opposing_party?: string;
    description?: string;
    address?: Record<string, unknown>;
    user_id?: string;
    conversation_id?: string | null;
    origin?: string | null;
  };
}

export interface CreateIntakeCheckoutSessionParams {
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  connectedAccountStripeId: string;
  intake: {
    id: string;
    currency: string;
    amount: number;
    conversation_id?: string | null;
    metadata?: PracticeClientIntakeMetadata | null;
  };
  request: {
    user_id?: string;
    origin?: string | null;
  };
}

export interface ResolveCheckoutSessionResult {
  intake?: Awaited<ReturnType<typeof practiceClientIntakesRepository.findById>>;
  session?: Stripe.Checkout.Session;
}
