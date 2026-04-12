import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { organizations } from '@/schema/better-auth-schema';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import { config } from '@/shared/config';
import { db } from '@/shared/database';
import { queueManager } from '@/shared/queue/queue.manager';
import { EMAIL_TEMPLATES } from '@/shared/services/email';
import { generateFrontendUrls } from '@/shared/utils/urls';

const logger = getLogger(['onboarding', 'handler', 'internal-events']);
const APP_URL = config.app.appUrl;

/**
 * Internal handler for account updated event
 */
const handleAccountUpdatedInternal = async (event: BaseEvent): Promise<void> => {
  logger.info('Onboarding account updated: {stripeAccountId} for organization {organizationId}', {
    stripeAccountId: event.payload?.['stripe_account_id'],
    organizationId: event.organizationId,
  });
};

/**
 * Internal handler for account requirements changed event
 */
const handleAccountRequirementsChanged = async (event: BaseEvent): Promise<void> => {
  const { organizationId } = event;
  logger.info('Onboarding account requirements changed: {stripeAccountId}', {
    stripeAccountId: event.payload?.['stripe_account_id'],
    organizationId,
  });

  if (!organizationId) {
    logger.error('Missing organizationId in account requirements changed event');
    return;
  }

  try {
    // Get organization details for practice slug
    const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);

    // Send verification needed email (fire and forget)
    const { payload } = event;
    const email = typeof payload['billing_email'] === 'string' ? payload['billing_email'] : undefined;
    const name = typeof payload['organization_name'] === 'string' ? payload['organization_name'] : 'there';

    if (email) {
      const payoutsUrl = org?.slug ? generateFrontendUrls.practicePayoutsSettings(org.slug) : `${APP_URL}/dashboard/settings/billing`;
      
      void queueManager
        .addEmailJob(EMAIL_TEMPLATES.STRIPE_CONNECT_STATUS, email, 'Action required: Verify your account information', {
          recipientEmail: email,
          recipientName: name,
          dashboardUrl: payoutsUrl, // Use payouts URL as primary dashboard URL
          tutorialUrl: `${APP_URL}/docs/verification`,
          supportUrl: 'https://blawby.com/help',
          payoutsUrl, // Add practice-specific payouts URL
        })
        .catch((error: unknown) => {
          logger.error('Failed to queue Connect status email for {organizationId}: {error}', {
            organizationId,
            error,
          });
        });
    } else {
      logger.warn('Skipping Connect status email: missing billing_email for {organizationId}', {
        organizationId,
      });
    }
  } catch (error) {
    logger.error('Failed to handle account requirements changed for {organizationId}: {error}', {
      organizationId,
      error,
    });
  }
};

/**
 * Internal handler for account capabilities updated event
 */
const handleCapabilitiesUpdatedInternal = async (event: BaseEvent): Promise<void> => {
  logger.info('Onboarding account capabilities updated: {stripeAccountId}', {
    stripeAccountId: event.payload?.['stripe_account_id'],
    organizationId: event.organizationId,
  });
};

/**
 * Internal handler for external account created event
 */
const handleExternalAccountCreatedInternal = async (event: BaseEvent): Promise<void> => {
  logger.info('Onboarding external account created: {stripeAccountId}', {
    stripeAccountId: event.payload?.['stripe_account_id'],
    organizationId: event.organizationId,
  });
};

/**
 * Internal handler for external account updated event
 */
const handleExternalAccountUpdatedInternal = async (event: BaseEvent): Promise<void> => {
  logger.info('Onboarding external account updated: {stripeAccountId}', {
    stripeAccountId: event.payload?.['stripe_account_id'],
    organizationId: event.organizationId,
  });
};

/**
 * Internal handler for external account deleted event
 */
const handleExternalAccountDeletedInternal = async (event: BaseEvent): Promise<void> => {
  logger.info('Onboarding external account deleted: {stripeAccountId}', {
    stripeAccountId: event.payload?.['stripe_account_id'],
    organizationId: event.organizationId,
  });
};

export {
  handleAccountRequirementsChanged,
  handleAccountUpdatedInternal,
  handleCapabilitiesUpdatedInternal,
  handleExternalAccountCreatedInternal,
  handleExternalAccountUpdatedInternal,
  handleExternalAccountDeletedInternal,
};
