/**
 * Onboarding Completed Handler
 *
 * Handles onboarding completion events
 */

import { eq } from 'drizzle-orm';
import { organizations } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import { SYSTEM_ACTOR_UUID } from '@/shared/events/constants';
import { logError } from '@/shared/middleware/logger';

/**
 * Handle onboarding completion
 */
export const handleOnboardingCompleted = async (event: BaseEvent): Promise<void> => {
  const { organizationId } = event;

  if (!organizationId) {
    logError(new Error('No organization ID in onboarding completed event'), {
      method: 'EVENT_HANDLER',
      url: 'onboarding-completed',
      statusCode: 400,
      errorType: 'ValidationError',
      errorMessage: 'Missing organization ID',
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
      logError(new Error(`Organization not found: ${organizationId}`), {
        method: 'EVENT_HANDLER',
        url: 'onboarding-completed',
        statusCode: 404,
        errorType: 'NotFoundError',
        errorMessage: 'Organization not found',
        organizationId,
      });
      return;
    }

    // Note: This handler processes events, so we can't use transactions
    // Event is written directly to database for guaranteed persistence
    void publishSimpleEvent(EventType.ONBOARDING_COMPLETED, organizationId, organizationId, {
      organization_id: organizationId,
      organization_name: org.name,
      billing_email: org.billingEmail,
      stripe_customer_id: org.stripeCustomerId,
      onboarding_completed_at: new Date().toISOString(),
    }).catch((error) => {
      console.error('Failed to publish ONBOARDING_COMPLETED event:', error);
    });

    // Event is written directly to database for guaranteed persistence
    void publishSimpleEvent(EventType.PRACTICE_UPDATED, SYSTEM_ACTOR_UUID, organizationId, {
      organization_id: organizationId,
      organization_name: org.name,
      update_type: 'onboarding_completed',
      updated_at: new Date().toISOString(),
    }).catch((error) => {
      console.error('Failed to publish PRACTICE_UPDATED event:', error);
    });
  } catch (error) {
    logError(error, {
      method: 'EVENT_HANDLER',
      url: 'onboarding-completed',
      statusCode: 500,
      errorType: 'OnboardingHandlerError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      organizationId,
    });
  }
};

