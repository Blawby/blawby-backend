import { getLogger } from '@logtape/logtape';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import { config } from '@/shared/config';
import { addEmailJob } from '@/shared/queue/queue.manager';
import { EMAIL_TEMPLATES } from '@/shared/services/email';

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

  // Send verification needed email (fire and forget)
  const { payload } = event;
  const email = typeof payload['billing_email'] === 'string' ? payload['billing_email'] : undefined;
  const name = typeof payload['organization_name'] === 'string' ? payload['organization_name'] : 'there';

  if (email) {
    void addEmailJob(EMAIL_TEMPLATES.STRIPE_CONNECT_STATUS, email, 'Action required: Verify your account information', {
      recipientEmail: email,
      recipientName: name,
      dashboardUrl: `${APP_URL}/dashboard/settings/billing`,
      tutorialUrl: `${APP_URL}/docs/verification`,
      supportUrl: 'https://blawby.com/help',
    }).catch((error: unknown) => {
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
