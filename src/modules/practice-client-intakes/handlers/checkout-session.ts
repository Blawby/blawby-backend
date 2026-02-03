import { getLogger } from '@logtape/logtape';
import type Stripe from 'stripe';
import { stripe } from '@/shared/utils/stripe-client';
import { findPracticeClientIntakeByCheckoutSession } from '@/modules/practice-client-intakes/handlers/helpers';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { handlePracticeClientIntakeSucceeded } from '@/modules/practice-client-intakes/handlers/succeeded';

const logger = getLogger(['practice-client-intakes', 'handlers', 'checkout-session']);

export const handlePracticeClientIntakeCheckoutSessionCompleted = async (
  event: Stripe.Event,
): Promise<void> => {
  const session = event.data.object as Stripe.Checkout.Session;

  if (!session.id) {
    throw new Error('Checkout Session ID missing from checkout.session.completed event');
  }

  const practiceClientIntake = await findPracticeClientIntakeByCheckoutSession(session);

  if (!practiceClientIntake) {
    logger.info('Checkout session {sessionId} not associated with practice client intake', {
      sessionId: session.id,
    });
    return;
  }

  if (!practiceClientIntake.stripe_checkout_session_id) {
    await practiceClientIntakesRepository.update(practiceClientIntake.id, {
      stripe_checkout_session_id: session.id,
    });
  }

  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;

  if (!paymentIntentId) {
    throw new Error('Payment Intent ID missing from checkout.session.completed event');
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  await handlePracticeClientIntakeSucceeded({
    paymentIntent,
    eventId: event.id,
  });
};
