import { getLogger } from '@logtape/logtape';

import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { findPracticeDetailsByOrganization } from '@/modules/practice/database/queries/practice-details.repository';
import { organizationService } from '@/modules/practice/services/organization.service';
import {
  buildPracticeDetailsDeletedPayload,
  findAndDeletePracticeDetails,
  upsertDetailsTransaction,
} from '@/modules/practice/services/practice-management.helpers';
import type { PracticeDetailsResponse } from '@/modules/practice/types/practice-details.types';
import type { UpsertPracticeDetailsParams } from '@/modules/practice/types/practice-management.types';
import type { OrganizationRequestParams } from '@/modules/practice/types/practice.types';
import { db } from '@/shared/database';
import { PracticeDeleted, PracticeDetailsDeleted, PracticeSwitched } from '@/shared/events/definitions';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { internalError, ok } from '@/shared/utils/result';

const logger = getLogger(['practice', 'details-management-service']);

/**
 * Practice Details Management Service
 *
 * Handles upsert/delete of practice details, practice deletion, and session switching.
 */
export const practiceDetailsManagementService = {
  /**
   * Upsert practice details directly
   */
  async upsertPracticeDetails(
    { organizationId, data }: UpsertPracticeDetailsParams,
    ctx: ServiceContext
  ): Promise<Result<PracticeDetailsResponse>> {
    const { user } = ctx;
    try {
      const orgResult = await organizationService.getFullOrganization({ organizationId }, ctx);
      if (!orgResult.success) {return orgResult;}

      const organization = await organizationRepository.findById(organizationId);
      const existing = await findPracticeDetailsByOrganization(organizationId);

      const result = await db.transaction(async (tx) => upsertDetailsTransaction(tx, ctx, {
          organizationId,
          userId: user.id,
          data,
          existingAddressId: existing?.address_id,
          isCreate: !existing,
        }));

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
      logger.error('Failed to upsert practice details for {organizationId}: {error}', { organizationId, error });
      return internalError<PracticeDetailsResponse>('Failed to save practice details');
    }
  },

  /**
   * Delete practice details directly
   */
  async deletePracticeDetails(
    { organizationId }: OrganizationRequestParams,
    ctx: ServiceContext
  ): Promise<Result<{ success: boolean }>> {
    try {
      const orgResult = await organizationService.getFullOrganization({ organizationId }, ctx);
      if (!orgResult.success) {return orgResult;}

      await findAndDeletePracticeDetails(ctx, organizationId);

      return ok<{ success: boolean }>({ success: true });
    } catch (error) {
      logger.error('Failed to delete practice details for {organizationId}: {error}', { organizationId, error });
      return internalError<{ success: boolean }>('Failed to delete practice details');
    }
  },

  /**
   * Delete a practice and its details
   */
  async deletePractice(
    { organizationId }: OrganizationRequestParams,
    ctx: ServiceContext
  ): Promise<Result<{ success: boolean }>> {
    const { user } = ctx;
    try {
      const orgResult = await organizationService.getFullOrganization({ organizationId }, ctx);
      if (!orgResult.success) {return orgResult;}

      const existing = await findPracticeDetailsByOrganization(organizationId);

      const deleteResult = await organizationService.deleteOrganization({ organizationId }, ctx);
      if (!deleteResult.success) {return deleteResult;}

      if (existing) {
        await ctx.emit(PracticeDetailsDeleted, buildPracticeDetailsDeletedPayload(existing));
      }

      await ctx.emit(PracticeDeleted, {
        organization_id: organizationId,
        had_practice_details: Boolean(existing),
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
   * Set active practice for the session
   */
  async setActivePractice(
    { organizationId }: OrganizationRequestParams,
    ctx: ServiceContext
  ): Promise<Result<{ success: boolean }>> {
    const { user } = ctx;
    try {
      const activeResult = await organizationService.setActiveOrganization({ organizationId }, ctx);
      if (!activeResult.success) {return activeResult;}

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
