import { getLogger } from '@logtape/logtape';
import { omit } from 'es-toolkit/compat';
import { HTTPException } from 'hono/http-exception';

import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { findPracticeDetailsByOrganization } from '@/modules/practice/database/queries/practice-details.repository';
import type { PracticeDetails } from '@/modules/practice/database/schema/practice.schema';
import { organizationService } from '@/modules/practice/services/organization.service';
import { DETAILS_FIELD_KEYS, upsertDetailsTransaction } from '@/modules/practice/services/practice-management.helpers';
import { loadPracticeResponseById } from '@/modules/practice/services/practice-response.loader';
import type { CreatePracticeParams, UpdatePracticeParams } from '@/modules/practice/types/practice-management.types';
import type {
  UpdatePracticeRequest,
  PracticeResponse,
  OrganizationApiShape,
} from '@/modules/practice/types/practice.types';
import { practiceValidations } from '@/modules/practice/validations/practice.validation';
import { ForbiddenError } from '@casl/ability';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';
import { uow } from '@/shared/database/uow';
import { PracticeCreated, PracticeUpdated } from '@/shared/events/definitions';
import type { ServiceContext } from '@/shared/types/service-context';

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
  async createPractice({ data }: CreatePracticeParams, ctx: ServiceContext): Promise<{ practice: PracticeResponse }> {
    const { user } = ctx;
    try {
      const organizationData = omit(data, DETAILS_FIELD_KEYS);

      const organization = await organizationService.createOrganization({ data: organizationData }, ctx);

      let practiceDetails: PracticeDetails | null = null;

      try {
        practiceDetails = await uow.transaction(async () => {
          const { details } = await upsertDetailsTransaction(ctx, {
            organizationId: organization.id,
            userId: user.id,
            data: practiceValidations.hasPracticeDetails(data) ? data : {},
            isCreate: true,
          });
          return details;
        });
      } catch (detailsError) {
        try {
          await organizationService.deleteOrganization({ organizationId: organization.id }, ctx);
        } catch (rollbackError) {
          logger.error(
            'Create practice compensation failed for organization {organizationId}: {rollbackError} (original: {detailsError})',
            {
              organizationId: organization.id,
              rollbackError: rollbackError instanceof Error ? rollbackError.message : 'Unknown error',
              detailsError: detailsError instanceof Error ? detailsError.message : String(detailsError),
            }
          );
        }
        throw detailsError;
      }

      await ctx.emit(PracticeCreated, {
        organization_id: organization.id,
        name: organization.name,
        organization_name: organization.name,
        organization_slug: organization.slug,
        has_practice_details: Boolean(practiceDetails),
        practice_details_id: practiceDetails?.id,
        user_email: user.email,
      });

      const practice = await loadPracticeResponseById(organization.id);
      if (!practice) {
        throw new HTTPException(500, { message: 'Failed to load saved practice' });
      }

      return { practice };
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      logger.error('Failed to create practice for user {userId}: {error}', {
        userId: user.id,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new HTTPException(500, {
        message: getBetterAuthErrorMessage(error, 'Failed to create practice'),
      });
    }
  },

  /**
   * Update an existing practice (Unified Org + Details)
   */
  async updatePractice(
    { organizationId, data }: UpdatePracticeParams,
    ctx: ServiceContext
  ): Promise<{ practice: PracticeResponse }> {
    ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Organization');

    const { user } = ctx;
    try {
      const orgData = omit(data, DETAILS_FIELD_KEYS);

      const filteredOrgData = Object.fromEntries(
        Object.entries(orgData).filter(([_, value]) => value !== undefined && value !== null)
      ) as Partial<Pick<UpdatePracticeRequest, 'name' | 'slug' | 'logo' | 'metadata'>>;

      let organization: OrganizationApiShape | undefined = undefined;
      const hasOrganizationUpdates = Object.keys(filteredOrgData).length > 0;
      let previousOrganization: OrganizationApiShape | null = null;

      if (hasOrganizationUpdates) {
        const previousOrg = await organizationRepository.findById(organizationId);
        if (!previousOrg) {
          throw new HTTPException(404, { message: `Organization ${organizationId} not found` });
        }
        previousOrganization = previousOrg;

        organization = await organizationService.updateOrganization(
          { data: { organizationId, data: filteredOrgData } },
          ctx
        );
      } else {
        const existingOrganization = await organizationRepository.findById(organizationId);
        if (!existingOrganization) {
          throw new HTTPException(404, { message: `Organization ${organizationId} not found` });
        }
        organization = existingOrganization;
      }

      let practiceDetails: PracticeDetails | null = null;
      if (practiceValidations.hasPracticeDetails(data)) {
        const existing = await findPracticeDetailsByOrganization(organizationId);

        try {
          practiceDetails = await uow.transaction(async () => {
            const { details } = await upsertDetailsTransaction(ctx, {
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
            try {
              await organizationService.updateOrganization(
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
            } catch (rollbackError) {
              logger.error('Update practice compensation failed for organization {organizationId}: {error}', {
                organizationId,
                error: rollbackError instanceof Error ? rollbackError.message : 'Unknown error',
              });
            }
          }
          throw detailsError;
        }
      } else {
        const existing = await findPracticeDetailsByOrganization(organizationId);
        practiceDetails = existing ?? null;
      }

      await ctx.emit(PracticeUpdated, {
        organization_id: organizationId,
        name: organization.name ?? 'Unknown',
        organization_name: organization.name ?? 'Unknown',
        organization_slug: organization.slug ?? 'unknown',
        has_practice_details: Boolean(practiceDetails),
        practice_details_id: practiceDetails?.id,
        user_email: user.email,
      });

      const practice = await loadPracticeResponseById(organizationId);
      if (!practice) {
        throw new HTTPException(500, { message: 'Failed to load saved practice' });
      }

      return { practice };
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      logger.error('Failed to update practice {organizationId}: {error}', { organizationId, error });
      throw new HTTPException(500, {
        message: getBetterAuthErrorMessage(error, 'Failed to update practice'),
      });
    }
  },
};
