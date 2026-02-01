/**
 * User Details Module Event Listeners
 *
 * Handles user-detail-related events including automatic creation
 * from successful intake payments.
 */

import { getLogger } from '@logtape/logtape';
import { userDetailsService } from '@/modules/user-details/services/user-details.service';
import {
  IntakePaymentSucceeded,
  UserDetailsCreated,
  UserDetailsUpdated,
  UserDetailsDeleted,
  InvitationAccepted,
} from '@/shared/events/definitions';
import { Event } from '@/shared/events/event';

const logger = getLogger(['user-details', 'listeners']);

/**
 * Register all user-details event listeners
 */
export const registerUserDetailsListeners = (): void => {
  logger.info('Registering user-details event listeners...');

  // Auto-create user details on intake payment success
  Event.listen(IntakePaymentSucceeded, async (payload, context) => {
    if (!payload.uuid) {
      logger.warn('Intake payment succeeded event missing uuid');
      return;
    }

    if (!payload.client_email) {
      logger.error('Intake payment succeeded event missing client_email');
      return;
    }

    // user_id is optional - if present, it's the anonymous user ID from the session
    const userId = payload.user_id;

    logger.info('Creating user details from successful intake', {
      intakeId: payload.uuid,
      userId: userId ?? 'none',
    });

    // Use organizationId from the event context
    const result = await userDetailsService.createUserDetailsFromIntake({
      organizationId: context?.organizationId || payload.organization_id,
      intakeId: payload.uuid,
      userId, // Optional - will use email lookup if not provided
      email: payload.client_email,
      name: payload.client_name ?? '',
      phone: undefined,
    });

    if (result.success) {
      logger.info('Successfully created user details from intake', {
        userDetailId: result.data.id,
        intakeId: payload.uuid,
      });
    } else {
      logger.error('Failed to create user details from intake', {
        intakeId: payload.uuid,
        error: result.error,
      });
    }
  });

  // Handle Invitation Accepted (for direct client invites)
  Event.listen(InvitationAccepted, async (payload) => {
    if (payload.role !== 'client') {
      return;
    }

    logger.info('Invitation accepted by client, creating user details', {
      userId: payload.userId,
      organizationId: payload.organizationId,
    });

    const result = await userDetailsService.createUserDetails(
      payload.organizationId,
      {
        name: 'New Client', // Name might be updated later by the user or fetched from user record if available
        email: payload.email,
        status: 'active',
      },
      'system',
    );

    if (result.success) {
      if ('id' in result.data) {
        logger.info('Successfully created user details for invited client', {
          userDetailId: result.data.id,
          userId: payload.userId,
        });
      } else {
        logger.info('User details creation accepted (pending)', {
          userId: payload.userId,
          message: result.data.message,
        });
      }
    } else {
      logger.error('Failed to create user details for invited client', {
        userId: payload.userId,
        error: result.error,
      });
    }
  });

  // User Detail CRUD events
  Event.listen(UserDetailsCreated, async (payload) => {
    logger.info('User details created', { userDetailId: payload.user_detail_id });
  });

  Event.listen(UserDetailsUpdated, async (payload) => {
    logger.info('User details updated', { userDetailId: payload.user_detail_id });
  });

  Event.listen(UserDetailsDeleted, async (payload) => {
    logger.info('User details deleted', { userDetailId: payload.user_detail_id });
  });

  logger.info('User-details event listeners registered');
};
