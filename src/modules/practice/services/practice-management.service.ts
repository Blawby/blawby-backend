import { getLogger } from '@logtape/logtape';
import { omit } from 'es-toolkit/compat';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import {
  findPracticeDetailsByOrganization,
} from '@/modules/practice/database/queries/practice-details.repository';
import type { PracticeDetails } from '@/modules/practice/database/schema/practice.schema';
import { organizationService } from '@/modules/practice/services/organization.service';
import {
  DETAILS_FIELD_KEYS,
  buildPracticeWithDetails,
  upsertDetailsTransaction,
  buildPracticeDetailsDeletedPayload,
  findAndDeletePracticeDetails,
} from '@/modules/practice/services/practice-management.helpers';
import type {
  PracticeDetailsResponse,
} from '@/modules/practice/types/practice-details.types';
import type {
  CreatePracticeParams,
  UpdatePracticeParams,
  UpsertPracticeDetailsParams,
} from '@/modules/practice/types/practice-management.types';
import type {
  UpdatePracticeRequest,
  PracticeWithDetails,
  OrganizationRequestParams,
} from '@/modules/practice/types/practice.types';
import { practiceValidations } from '@/modules/practice/validations/practice.validation';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';
import { db } from '@/shared/database';
import {
  PracticeCreated,
  PracticeUpdated,
  PracticeDeleted,
  PracticeDetailsDeleted,
  PracticeSwitched,
} from '@/shared/events/definitions';
import type { Organization } from '@/shared/types/BetterAuth';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { forbidden, ok, internalError } from '@/shared/utils/result';

const { getBetterAuthErrorMessage } = betterAuthUtils;

const logger = getLogger(['practice', 'management-service']);

/**
 * Practice Management Service
 *
 * Handles mutation operations for practices (organizations + details)
 */
export const practiceManagementService = {
  /**
   * Create a new practice
   */
  async createPractice(
    { data, requestHeaders }: CreatePracticeParams,
    ctx: ServiceContext,
  ): Promise<Result<{ practice: PracticeWithDetails }>> {
    if (ctx.ability.cannot('update', 'Organization')) {
      return forbidden('You do not have permission to create practices');
    }

    const { user } = ctx;
    try {
      const organizationData = omit(data, DETAILS_FIELD_KEYS);

      const createResult = await organizationService.createOrganization(
        { data: organizationData, requestHeaders },
        ctx,
      );

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
          const rollbackResult = await organizationService.deleteOrganization(
            { organizationId: organization.id, requestHeaders },
            ctx,
          );
          if (!rollbackResult.success) {
            logger.error(
              'Create practice compensation failed for organization {organizationId}: {error}',
              { organizationId: organization.id, error: rollbackResult.error.message },
            );
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
        getBetterAuthErrorMessage(error, 'Failed to create practice'),
      );
    }
  },

  /**
   * Update an existing practice (Unified Org + Details)
   */
  async updatePractice(
    { organizationId, data, requestHeaders }: UpdatePracticeParams,
    ctx: ServiceContext,
  ): Promise<Result<{ practice: PracticeWithDetails }>> {
    if (ctx.ability.cannot('update', 'Organization')) {
      return forbidden('You do not have permission to update practices');
    }

    const { user } = ctx;
    try {
      const orgData = omit(data, DETAILS_FIELD_KEYS);

      const filteredOrgData = Object.fromEntries(
        Object.entries(orgData).filter(([_, value]) => value !== undefined && value !== null),
      ) as Partial<Pick<UpdatePracticeRequest, 'name' | 'slug' | 'logo' | 'metadata'>>;

      let organization: Organization;
      const hasOrganizationUpdates = Object.keys(filteredOrgData).length > 0;
      let previousOrganization: Organization | null = null;

      if (hasOrganizationUpdates) {
        const previousOrgResult = await organizationService.getFullOrganization(
          { organizationId, requestHeaders },
          ctx,
        );
        if (!previousOrgResult.success) return previousOrgResult;
        previousOrganization = previousOrgResult.data;

        const updateResult = await organizationService.updateOrganization(
          { data: { organizationId, data: filteredOrgData }, requestHeaders },
          ctx,
        );

        if (!updateResult.success) return updateResult;
        organization = updateResult.data;
      } else {
        const orgResult = await organizationService.getFullOrganization(
          { organizationId, requestHeaders },
          ctx,
        );
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
                requestHeaders,
              },
              ctx,
            );

            if (!rollbackResult.success) {
              logger.error(
                'Update practice compensation failed for organization {organizationId}: {error}',
                { organizationId, error: rollbackResult.error.message },
              );
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
        getBetterAuthErrorMessage(error, 'Failed to update practice'),
      );
    }
  },

  /**
   * Upsert practice details directly
   */
  async upsertPracticeDetails(
    { organizationId, data, requestHeaders }: UpsertPracticeDetailsParams,
    ctx: ServiceContext,
  ): Promise<Result<PracticeDetailsResponse>> {
    if (ctx.ability.cannot('update', 'Organization')) {
      return forbidden('You do not have permission to update practice details');
    }

    const { user } = ctx;
    try {
      const orgResult = await organizationService.getFullOrganization(
        { organizationId, requestHeaders },
        ctx,
      );
      if (!orgResult.success) return orgResult;

      const organization = await organizationRepository.findById(organizationId);

      const existing = await findPracticeDetailsByOrganization(organizationId);

      const result = await db.transaction(async (tx) => {
        return upsertDetailsTransaction(tx, ctx, {
          organizationId,
          userId: user.id,
          data,
          existingAddressId: existing?.address_id,
          isCreate: !existing,
        });
      });

      const responseData: PracticeDetailsResponse = {
        ...result.details,
        organization_id: organizationId,
        address: result.addressResult
          ? {
            line1: result.addressResult.line1 ?? undefined,
            line2: result.addressResult.line2 ?? undefined,
            city: result.addressResult.city ?? undefined,
            state: result.addressResult.state ?? undefined,
            postal_code: result.addressResult.postal_code ?? undefined,
            country: result.addressResult.country ?? undefined,
          }
          : null,
        services: result.syncedServices.map((s) => ({ id: s.id, name: s.name, key: s.key })),
        name: orgResult.data.name,
        logo: orgResult.data.logo ?? null,
        payment_link_enabled: organization?.paymentLinkEnabled ?? false,
        payment_link_prefill_amount: organization?.paymentLinkPrefillAmount ?? 0,
      };

      return ok<PracticeDetailsResponse>(responseData);
    } catch (error) {
      logger.error(
        'Failed to upsert practice details for {organizationId}: {error}',
        { organizationId, error },
      );
      return internalError<PracticeDetailsResponse>('Failed to save practice details');
    }
  },

  /**
   * Delete a practice and its details
   */
  async deletePractice(
    { organizationId, requestHeaders }: OrganizationRequestParams,
    ctx: ServiceContext,
  ): Promise<Result<{ success: boolean }>> {
    if (ctx.ability.cannot('update', 'Organization')) {
      return forbidden('You do not have permission to delete practices');
    }

    const { user } = ctx;
    try {
      const orgResult = await organizationService.getFullOrganization(
        { organizationId, requestHeaders },
        ctx,
      );
      if (!orgResult.success) return orgResult;

      const existing = await findPracticeDetailsByOrganization(organizationId);

      const deleteResult = await organizationService.deleteOrganization(
        { organizationId, requestHeaders },
        ctx,
      );
      if (!deleteResult.success) return deleteResult;

      if (existing) {
        await ctx.emit(PracticeDetailsDeleted, buildPracticeDetailsDeletedPayload(existing));
      }

      await ctx.emit(PracticeDeleted, {
        organization_id: organizationId,
        had_practice_details: !!existing,
        practice_details_id: existing?.id,
        user_email: user.email,
      });

      return ok<{ success: boolean }>({ success: true });
    } catch (error) {
      logger.error('Failed to delete practice {organizationId}: {error}', { organizationId, error });
      return internalError<{ success: boolean }>('Failed to delete practice');
    }
  },

  /**
   * Delete practice details directly
   */
  async deletePracticeDetails(
    { organizationId, requestHeaders }: OrganizationRequestParams,
    ctx: ServiceContext,
  ): Promise<Result<{ success: boolean }>> {
    if (ctx.ability.cannot('update', 'Organization')) {
      return forbidden('You do not have permission to delete practice details');
    }

    try {
      const orgResult = await organizationService.getFullOrganization(
        { organizationId, requestHeaders },
        ctx,
      );
      if (!orgResult.success) return orgResult;

      await findAndDeletePracticeDetails(ctx, organizationId);

      return ok<{ success: boolean }>({ success: true });
    } catch (error) {
      logger.error(
        'Failed to delete practice details for {organizationId}: {error}',
        { organizationId, error },
      );
      return internalError<{ success: boolean }>('Failed to delete practice details');
    }
  },

  /**
   * Set active practice for the session
   */
  async setActivePractice(
    { organizationId, requestHeaders }: OrganizationRequestParams,
    ctx: ServiceContext,
  ): Promise<Result<{ success: boolean }>> {
    if (ctx.ability.cannot('update', 'Organization')) {
      return forbidden('You do not have permission to switch active practice');
    }

    const { user } = ctx;
    try {
      const activeResult = await organizationService.setActiveOrganization(
        { organizationId, requestHeaders },
        ctx,
      );
      if (!activeResult.success) return activeResult;

      await ctx.emit(PracticeSwitched, {
        user_id: user.id,
        to_organization_id: organizationId,
        user_email: user.email,
        switched_to_organization: organizationId,
      });

      return ok<{ success: boolean }>({ success: true });
    } catch (error) {
      logger.error('Failed to set active practice {organizationId}: {error}', { organizationId, error });
      return internalError<{ success: boolean }>('Failed to set active practice');
    }
  },
};
