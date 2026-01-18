import { getLogger } from '@logtape/logtape';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';

const logger = getLogger(['onboarding', 'handler', 'internal-events']);

/**
 * Internal handler for account updated event
 */
export const handleAccountUpdatedInternal = async (event: BaseEvent): Promise<void> => {
  logger.info("Onboarding account updated: {stripeAccountId} for organization {organizationId}", {
    stripeAccountId: event.payload?.stripe_account_id,
    organizationId: event.organizationId,
  });
};

/**
 * Internal handler for account requirements changed event
 */
export const handleAccountRequirementsChanged = async (event: BaseEvent): Promise<void> => {
  logger.info("Onboarding account requirements changed: {stripeAccountId}", {
    stripeAccountId: event.payload?.stripe_account_id,
    organizationId: event.organizationId,
  });
};

/**
 * Internal handler for account capabilities updated event
 */
export const handleCapabilitiesUpdatedInternal = async (event: BaseEvent): Promise<void> => {
  logger.info("Onboarding account capabilities updated: {stripeAccountId}", {
    stripeAccountId: event.payload?.stripe_account_id,
    organizationId: event.organizationId,
  });
};

/**
 * Internal handler for external account created event
 */
export const handleExternalAccountCreatedInternal = async (event: BaseEvent): Promise<void> => {
  logger.info("Onboarding external account created: {stripeAccountId}", {
    stripeAccountId: event.payload?.stripe_account_id,
    organizationId: event.organizationId,
  });
};

/**
 * Internal handler for external account updated event
 */
export const handleExternalAccountUpdatedInternal = async (event: BaseEvent): Promise<void> => {
  logger.info("Onboarding external account updated: {stripeAccountId}", {
    stripeAccountId: event.payload?.stripe_account_id,
    organizationId: event.organizationId,
  });
};

/**
 * Internal handler for external account deleted event
 */
export const handleExternalAccountDeletedInternal = async (event: BaseEvent): Promise<void> => {
  logger.info("Onboarding external account deleted: {stripeAccountId}", {
    stripeAccountId: event.payload?.stripe_account_id,
    organizationId: event.organizationId,
  });
};
