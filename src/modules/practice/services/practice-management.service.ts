import { getLogger } from '@logtape/logtape';
import { omit } from 'es-toolkit/compat';

import { findPracticeDetailsByOrganization } from '@/modules/practice/database/queries/practice-details.repository';
import type { PracticeDetails } from '@/modules/practice/database/schema/practice.schema';
import { organizationService } from '@/modules/practice/services/organization.service';
import {
  DETAILS_FIELD_KEYS,
  buildPracticeWithDetails,
  upsertDetailsTransaction,
} from '@/modules/practice/services/practice-management.helpers';
import type { CreatePracticeParams, UpdatePracticeParams } from '@/modules/practice/types/practice-management.types';
import type { UpdatePracticeRequest, PracticeWithDetails } from '@/modules/practice/types/practice.types';
import { practiceValidations } from '@/modules/practice/validations/practice.validation';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';
import { db } from '@/shared/database';
import { PracticeCreated, PracticeUpdated } from '@/shared/events/definitions';
import type { Organization } from '@/shared/types/BetterAuth';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { forbidden, ok, internalError } from '@/shared/utils/result';

const { getBetterAuthErrorMessage } = betterAuthUtils;

const logger = getLogger(['practice', 'management-service']);

/**
 * Practice Management Service
 *
 * Handles create and update of practices (org + details coordination with Better Auth).
 * For delete, details upsert/delete, and session switching see practice-details-management.service.ts
 */
export const practiceManagementService = {
  /**
   * Create a new practice
   */
  async createPractice(
    { data }: CreatePracticeParams,
    ctx: ServiceContext
  ): Promise<Result<{ practice: PracticeWithDetails }>> {
    if (ctx.ability.cannot('update', 'Organization')) {
      return forbidden('You do not have permission to create practices');
    }

    const { user } = ctx;
    try {
      const organizationData = omit(data, DETAILS_FIELD_KEYS);

      const createResult = await organizationService.createOrganization({ data: organizationData }, ctx);

      if (!createResult.success) {
        return createResult;
      }
      const organization = createResult.data;

      let practiceDetails: PracticeDetails | null = null;

      if (practiceValidations.hasPracticeDetails(data)) {
        try {
          practiceDetails = await db.transaction(async (tx) => {
            const { details } = await upsertDetailsTransaction(tx, ctx, {
              organizationId: organization.id,
              userId: user.id,
              data,
              isCreate: true,
            });
            return details;
          });
        } catch (detailsError) {
          const rollbackResult = await organizationService.deleteOrganization({ organizationId: organization.id }, ctx);
          if (!rollbackResult.success) {
            logger.error('Create practice compensation failed for organization {organizationId}: {error}', {
              organizationId: organization.id,
              error: rollbackResult.error.message,
            });
          }
          throw detailsError;
        }
      }

      await ctx.emit(PracticeCreated, {
        organization_id: organization.id,
        name: organization.name,
        organization_name: organization.name,
        organization_slug: organization.slug,
        has_practice_details: !!practiceDetails,
        practice_details_id: practiceDetails?.id,
        user_email: user.email,
      });

      return ok<{ practice: PracticeWithDetails }>({
        practice: buildPracticeWithDetails(organization, practiceDetails),
      });
    } catch (error) {
      logger.error('Failed to create practice for user {userId}: {error}', { userId: user.id, error });
      return internalError<{ practice: PracticeWithDetails }>(
        getBetterAuthErrorMessage(error, 'Failed to create practice')
      );
    }
  },

  /**
   * Update an existing practice (Unified Org + Details)
   */
  async updatePractice(
    { organizationId, data }: UpdatePracticeParams,
    ctx: ServiceContext
  ): Promise<Result<{ practice: PracticeWithDetails }>> {
    if (ctx.ability.cannot('update', 'Organization')) {
      return forbidden('You do not have permission to update practices');
    }

    const { user } = ctx;
    try {
      const orgData = omit(data, DETAILS_FIELD_KEYS);

      const filteredOrgData = Object.fromEntries(
        Object.entries(orgData).filter(([_, value]) => value !== undefined && value !== null)
      ) as Partial<Pick<UpdatePracticeRequest, 'name' | 'slug' | 'logo' | 'metadata'>>;

      let organization: Organization;
      const hasOrganizationUpdates = Object.keys(filteredOrgData).length > 0;
      let previousOrganization: Organization | null = null;

      if (hasOrganizationUpdates) {
        const previousOrgResult = await organizationService.getFullOrganization({ organizationId }, ctx);
        if (!previousOrgResult.success) return previousOrgResult;
        previousOrganization = previousOrgResult.data;

        const updateResult = await organizationService.updateOrganization(
          { data: { organizationId, data: filteredOrgData } },
          ctx
        );

        if (!updateResult.success) return updateResult;
        organization = updateResult.data;
      } else {
        const orgResult = await organizationService.getFullOrganization({ organizationId }, ctx);
        if (!orgResult.success) return orgResult;
        organization = orgResult.data;
      }

      let practiceDetails: PracticeDetails | null = null;
      if (practiceValidations.hasPracticeDetails(data)) {
        const existing = await findPracticeDetailsByOrganization(organizationId);

        try {
          practiceDetails = await db.transaction(async (tx) => {
            const { details } = await upsertDetailsTransaction(tx, ctx, {
              organizationId,
              userId: user.id,
              data,
              existingAddressId: existing?.address_id,
              isCreate: !existing,
            });
            return details;
          });
        } catch (detailsError) {
          if (hasOrganizationUpdates && previousOrganization) {
            const rollbackResult = await organizationService.updateOrganization(
              {
                data: {
                  organizationId,
                  data: {
                    name: previousOrganization.name,
                    slug: previousOrganization.slug,
                    logo: previousOrganization.logo ?? undefined,
                    metadata: previousOrganization.metadata ?? undefined,
                  },
                },
              },
              ctx
            );

            if (!rollbackResult.success) {
              logger.error('Update practice compensation failed for organization {organizationId}: {error}', {
                organizationId,
                error: rollbackResult.error.message,
              });
            }
          }
          throw detailsError;
        }
      } else {
        const existing = await findPracticeDetailsByOrganization(organizationId);
        practiceDetails = existing || null;
      }

      await ctx.emit(PracticeUpdated, {
        organization_id: organizationId,
        name: organization?.name || 'Unknown',
        organization_name: organization?.name || 'Unknown',
        organization_slug: organization?.slug || 'unknown',
        has_practice_details: !!practiceDetails,
        practice_details_id: practiceDetails?.id,
        user_email: user.email,
      });

      return ok<{ practice: PracticeWithDetails }>({
        practice: buildPracticeWithDetails(organization, practiceDetails),
      });
    } catch (error) {
      logger.error('Failed to update practice {organizationId}: {error}', { organizationId, error });
      return internalError<{ practice: PracticeWithDetails }>(
        getBetterAuthErrorMessage(error, 'Failed to update practice')
      );
    }
  },
};
