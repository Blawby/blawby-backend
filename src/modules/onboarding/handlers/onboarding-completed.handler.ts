/**
 * Onboarding Completed Handler
 *
 * Handles onboarding completion events
 */

import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { organizations } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import { SYSTEM_ACTOR_UUID } from '@/shared/events/constants';

const logger = getLogger(['onboarding', 'handler', 'onboarding-completed']);

/**
 * Handle onboarding completion
 */
export const handleOnboardingCompleted = async (event: BaseEvent): Promise<void> => {
  const { organizationId } = event;

  if (!organizationId) {
    logger.error("No organization ID in onboarding completed event", {
      event,
    });
    return;
  }

  try {
    // Get organization details for event context
    const orgResults = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const org = orgResults[0];
    if (!org) {
      logger.error("Organization not found for onboarding completion: {organizationId}", {
        organizationId,
      });
      return;
    }

    // Note: This handler processes events, so we can't use transactions
    // Event is written directly to database for guaranteed persistence
    void publishSimpleEvent(EventType.ONBOARDING_COMPLETED_PROCESSED, organizationId, organizationId, {
      organization_id: organizationId,
      organization_name: org.name,
      billing_email: org.billingEmail,
      stripe_customer_id: org.stripeCustomerId,
      onboarding_completed_at: new Date().toISOString(),
    }).catch((error) => {
      logger.error("Failed to publish ONBOARDING_COMPLETED event for {organizationId}: {error}", {
        organizationId,
        error,
      });
    });

    // Event is written directly to database for guaranteed persistence
    void publishSimpleEvent(EventType.PRACTICE_UPDATED, SYSTEM_ACTOR_UUID, organizationId, {
      organization_id: organizationId,
      organization_name: org.name,
      update_type: 'onboarding_completed',
      updated_at: new Date().toISOString(),
    }).catch((error) => {
      logger.error("Failed to publish PRACTICE_UPDATED event for {organizationId}: {error}", {
        organizationId,
        error,
      });
    });
  } catch (error) {
    logger.error("Failed to handle onboarding completion for {organizationId}: {error}", {
      organizationId,
      error,
    });
  }
};
