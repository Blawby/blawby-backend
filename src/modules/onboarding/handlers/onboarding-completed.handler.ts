/**
 * Onboarding Completed Handler
 *
 * Handles onboarding completion events
 */

import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { organizations } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';
import { SYSTEM_ACTOR_UUID } from '@/shared/events/constants';
import { OnboardingCompletedProcessed, PracticeUpdated } from '@/shared/events/definitions';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import { addEmailJob } from '@/shared/queue/queue.manager';
import { EMAIL_TEMPLATES } from '@/shared/services/email';

const logger = getLogger(['onboarding', 'handler', 'onboarding-completed']);
const APP_URL = process.env.APP_URL ?? 'https://app.blawby.com';

/**
 * Handle onboarding completion
 */
export const handleOnboardingCompleted = async (event: BaseEvent): Promise<void> => {
  const { organizationId } = event;

  if (!organizationId) {
    logger.error('No organization ID in onboarding completed event', {
      event,
    });
    return;
  }

  try {
    // Get organization details for event context
    const orgResults = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);

    const org = orgResults[0];
    if (!org) {
      logger.error('Organization not found for onboarding completion: {organizationId}', {
        organizationId,
      });
      return;
    }

    // Note: This handler processes events, so we can't use transactions
    // Event is written directly to database for guaranteed persistence
    void OnboardingCompletedProcessed.dispatch(
      {
        organization_id: organizationId,
        organization_name: org.name,
        billing_email: org.billingEmail,
        stripe_customer_id: org.stripeCustomerId,
        onboarding_completed_at: new Date().toISOString(),
      },
      {
        actorId: organizationId,
        organizationId,
      }
    );

    void PracticeUpdated.dispatch(
      {
        organization_id: organizationId,
        organization_name: org.name,
        update_type: 'onboarding_completed',
        updated_at: new Date().toISOString(),
      },
      {
        actorId: SYSTEM_ACTOR_UUID,
        organizationId,
      }
    );

    // Send Stripe Connect welcome email (fire and forget)
    const {payload} = event;
    const email =
      typeof payload['billing_email'] === 'string' ? payload['billing_email'] : org.billingEmail ?? undefined;
    const name = typeof payload['organization_name'] === 'string' ? payload['organization_name'] : org.name;

    if (email) {
      void addEmailJob(EMAIL_TEMPLATES.STRIPE_CONNECT_WELCOME, email, 'Your Stripe account is connected!', {
        recipientEmail: email,
        recipientName: name,
        dashboardUrl: `${APP_URL}/dashboard`,
        tutorialUrl: `${APP_URL}/docs/payments`,
        supportUrl: 'https://blawby.com/help',
      }).catch((error: unknown) => {
        logger.error('Failed to queue Connect welcome email for {organizationId}: {error}', {
          organizationId,
          error,
        });
      });
    } else {
      logger.warn('Skipping Connect welcome email: missing billing_email for {organizationId}', {
        organizationId,
      });
    }
  } catch (error) {
    logger.error('Failed to handle onboarding completion for {organizationId}: {error}', {
      organizationId,
      error,
    });
  }
};
