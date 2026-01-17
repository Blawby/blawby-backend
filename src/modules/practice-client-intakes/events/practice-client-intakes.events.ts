/**
 * Practice Client Intakes Event Handlers
 *
 * Registers handlers for practice client intake payment events.
 * Listens to PAYMENT_* events and updates intake records, then publishes INTAKE_PAYMENT_* events.
 */

import { consola } from 'consola';
import type Stripe from 'stripe';

import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { findPracticeClientIntakeByPaymentIntent } from '@/modules/practice-client-intakes/handlers/helpers';
import { EventType } from '@/shared/events/enums/event-types';
import { subscribeToEvent } from '@/shared/events/event-consumer';
import { publishSimpleEvent, publishEventTx, ORGANIZATION_ACTOR_UUID } from '@/shared/events/event-publisher';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import { sanitizeError } from '@/shared/utils/logging';
import { stripe } from '@/shared/utils/stripe-client';
import { db } from '@/shared/database';

/**
 * Register all practice client intake event handlers
 */
export const registerPracticeClientIntakeEvents = (): void => {
  console.info('Registering practice client intake event handlers...');

  // Listen to PAYMENT_SUCCEEDED and update intake, then publish INTAKE_PAYMENT_SUCCEEDED
  subscribeToEvent(EventType.PAYMENT_SUCCEEDED, async (event: BaseEvent) => {
    try {
      const stripePaymentIntentId = event.payload.stripe_payment_intent_id as string | undefined;
      if (!stripePaymentIntentId) {
        return;
      }

      // Fetch payment intent from Stripe to get full details
      const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId) as Stripe.PaymentIntent;
      const practiceClientIntake = await findPracticeClientIntakeByPaymentIntent(paymentIntent);

      if (!practiceClientIntake) {
        return;
      }

      // Extract latest_charge safely
      const stripeChargeId = paymentIntent.latest_charge
        ? typeof paymentIntent.latest_charge === 'string'
          ? paymentIntent.latest_charge
          : paymentIntent.latest_charge.id
        : undefined;

      // Update practice client intake status and publish event within transaction
      await db.transaction(async (tx) => {
        await practiceClientIntakesRepository.update(practiceClientIntake.id, {
          status: 'succeeded',
          stripePaymentIntentId: paymentIntent.id,
          stripeChargeId,
          succeededAt: new Date(),
        });

        // Publish intake-specific event within transaction
        await publishEventTx(tx, {
          type: EventType.INTAKE_PAYMENT_SUCCEEDED,
          actorId: ORGANIZATION_ACTOR_UUID,
          actorType: 'api',
          organizationId: practiceClientIntake.organizationId,
          payload: {
            event_id: event.payload.event_id,
            stripe_payment_intent_id: paymentIntent.id,
            intake_payment_id: practiceClientIntake.id,
            uuid: practiceClientIntake.id,
            amount: practiceClientIntake.amount,
            currency: practiceClientIntake.currency,
            client_email: practiceClientIntake.metadata?.email,
            client_name: practiceClientIntake.metadata?.name,
            stripe_charge_id: stripeChargeId,
            succeeded_at: new Date().toISOString(),
          },
        });
      });

      consola.info('Intake payment succeeded', {
        intakeId: practiceClientIntake.id,
        stripePaymentIntentId: paymentIntent.id,
      });
    } catch (error) {
      consola.error('Failed to handle PAYMENT_SUCCEEDED for intake', {
        error: sanitizeError(error),
        eventId: event.eventId,
      });
    }
  });

  // Listen to PAYMENT_FAILED and update intake, then publish INTAKE_PAYMENT_FAILED
  subscribeToEvent(EventType.PAYMENT_FAILED, async (event: BaseEvent) => {
    try {
      const stripePaymentIntentId = event.payload.stripe_payment_intent_id as string | undefined;
      if (!stripePaymentIntentId) {
        return;
      }

      // Fetch payment intent from Stripe to get full details
      const paymentIntent: Stripe.PaymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
      const practiceClientIntake = await findPracticeClientIntakeByPaymentIntent(paymentIntent);

      if (!practiceClientIntake) {
        return;
      }

      // Update practice client intake status and publish event within transaction
      await db.transaction(async (tx) => {
        await practiceClientIntakesRepository.update(practiceClientIntake.id, {
          status: 'failed',
          stripePaymentIntentId: paymentIntent.id,
        });

        // Publish intake-specific event within transaction
        await publishEventTx(tx, {
          type: EventType.INTAKE_PAYMENT_FAILED,
          actorId: ORGANIZATION_ACTOR_UUID,
          actorType: 'api',
          organizationId: practiceClientIntake.organizationId,
          payload: {
            intake_payment_id: practiceClientIntake.id,
            uuid: practiceClientIntake.id,
            amount: practiceClientIntake.amount,
            currency: practiceClientIntake.currency,
            client_email: practiceClientIntake.metadata?.email,
            client_name: practiceClientIntake.metadata?.name,
            failure_reason: paymentIntent.last_payment_error?.message,
            failed_at: new Date().toISOString(),
          },
        });
      });

      consola.warn('Intake payment failed', {
        intakeId: practiceClientIntake.id,
        stripePaymentIntentId: paymentIntent.id,
        failureReason: paymentIntent.last_payment_error?.message,
      });
    } catch (error) {
      consola.error('Failed to handle PAYMENT_FAILED for intake', {
        error: sanitizeError(error),
        eventId: event.eventId,
      });
    }
  });

  // Listen to PAYMENT_CANCELED and update intake, then publish INTAKE_PAYMENT_CANCELED
  subscribeToEvent(EventType.PAYMENT_CANCELED, async (event: BaseEvent) => {
    try {
      const stripePaymentIntentId = event.payload.stripe_payment_intent_id as string | undefined;
      if (!stripePaymentIntentId) {
        return;
      }

      // Fetch payment intent from Stripe to get full details
      const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId) as Stripe.PaymentIntent;
      const practiceClientIntake = await findPracticeClientIntakeByPaymentIntent(paymentIntent);

      if (!practiceClientIntake) {
        return;
      }

      // Update practice client intake status and publish event within transaction
      await db.transaction(async (tx) => {
        await practiceClientIntakesRepository.update(practiceClientIntake.id, {
          status: 'canceled',
          stripePaymentIntentId: paymentIntent.id,
        });

        // Publish intake-specific event within transaction
        // Use ORGANIZATION_ACTOR_UUID as the actor since this is triggered by webhook
        await publishEventTx(tx, {
          type: EventType.INTAKE_PAYMENT_CANCELED,
          actorId: ORGANIZATION_ACTOR_UUID,
          actorType: 'api',
          organizationId: practiceClientIntake.organizationId,
          payload: {
            intake_payment_id: practiceClientIntake.id,
            uuid: practiceClientIntake.id,
            amount: practiceClientIntake.amount,
            currency: practiceClientIntake.currency,
            client_email: practiceClientIntake.metadata?.email,
            client_name: practiceClientIntake.metadata?.name,
            canceled_at: new Date().toISOString(),
          },
        });
      });

      consola.info('Intake payment canceled', {
        intakeId: practiceClientIntake.id,
        stripePaymentIntentId: paymentIntent.id,
      });
    } catch (error) {
      consola.error('Failed to handle PAYMENT_CANCELED for intake', {
        error: sanitizeError(error),
        eventId: event.eventId,
      });
    }
  });

  // Intake payment created (already published from service)
  subscribeToEvent(EventType.INTAKE_PAYMENT_CREATED, async (event: BaseEvent) => {
    console.info('Intake payment created', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
    // Future: Send confirmation email, analytics tracking, etc.
  });

  // Intake payment succeeded (published after DB update)
  subscribeToEvent(EventType.INTAKE_PAYMENT_SUCCEEDED, async (event: BaseEvent) => {
    console.info('Intake payment succeeded', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
    // Future: Send receipt email, update analytics, trigger workflows, etc.
  });

  // Intake payment failed (published after DB update)
  subscribeToEvent(EventType.INTAKE_PAYMENT_FAILED, async (event: BaseEvent) => {
    console.info('Intake payment failed', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
    // Future: Send failure notification, retry logic, analytics tracking, etc.
  });

  // Intake payment canceled (published after DB update)
  subscribeToEvent(EventType.INTAKE_PAYMENT_CANCELED, async (event: BaseEvent) => {
    console.info('Intake payment canceled', {
      eventId: event.eventId,
      organizationId: event.organizationId,
      actorId: event.actorId,
    });
    // Future: Analytics tracking, cleanup tasks, etc.
  });

  console.info('✅ Practice client intake event handlers registered');
};
