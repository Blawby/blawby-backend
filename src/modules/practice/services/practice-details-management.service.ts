import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { ForbiddenError } from '@casl/ability';

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
import type { ServiceContext } from '@/shared/types/service-context';

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
  ): Promise<PracticeDetailsResponse> {
    ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Organization');

    const { user } = ctx;
    try {
      const organization = await organizationRepository.findById(organizationId);
      if (!organization) {
        throw new HTTPException(404, { message: `Organization not found for '${organizationId}'` });
      }

      const existing = await findPracticeDetailsByOrganization(organizationId);

      const result = await db.transaction(async (tx) =>
        upsertDetailsTransaction(tx, ctx, {
          organizationId,
          userId: user.id,
          data,
          existingAddressId: existing?.address_id,
          isCreate: !existing,
        })
      );

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
        name: organization.name,
        logo: organization.logo ?? null,
        payment_link_enabled: organization?.paymentLinkEnabled ?? false,
        payment_link_prefill_amount: result.details.consultation_fee ?? 0,
      };

      return responseData;
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      logger.error('Failed to upsert practice details for {organizationId}: {error}', { organizationId, error });
      throw new HTTPException(500, { message: 'Failed to save practice details' });
    }
  },

  /**
   * Delete practice details directly
   */
  async deletePracticeDetails(
    { organizationId }: OrganizationRequestParams,
    ctx: ServiceContext
  ): Promise<{ success: boolean }> {
    ForbiddenError.from(ctx.ability).throwUnlessCan('delete', 'Organization');

    try {
      const organization = await organizationRepository.findById(organizationId);
      if (!organization) {
        throw new HTTPException(404, { message: `Organization not found for '${organizationId}'` });
      }

      await findAndDeletePracticeDetails(ctx, organizationId);

      return { success: true };
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      logger.error('Failed to delete practice details for {organizationId}: {error}', { organizationId, error });
      throw new HTTPException(500, { message: 'Failed to delete practice details' });
    }
  },

  /**
   * Delete a practice and its details
   */
  async deletePractice(
    { organizationId }: OrganizationRequestParams,
    ctx: ServiceContext
  ): Promise<{ success: boolean }> {
    ForbiddenError.from(ctx.ability).throwUnlessCan('delete', 'Organization');

    const { user } = ctx;
    try {
      const organization = await organizationRepository.findById(organizationId);
      if (!organization) {
        throw new HTTPException(404, { message: `Organization not found for '${organizationId}'` });
      }

      const existing = await findPracticeDetailsByOrganization(organizationId);

      await organizationService.deleteOrganization({ organizationId }, ctx);

      if (existing) {
        await ctx.emit(PracticeDetailsDeleted, buildPracticeDetailsDeletedPayload(existing));
      }

      await ctx.emit(PracticeDeleted, {
        organization_id: organizationId,
        had_practice_details: Boolean(existing),
        practice_details_id: existing?.id,
        user_email: user.email,
      });

      return { success: true };
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      logger.error('Failed to delete practice {organizationId}: {error}', { organizationId, error });
      throw new HTTPException(500, { message: 'Failed to delete practice' });
    }
  },

  /**
   * Set active practice for the session
   */
  async setActivePractice(
    { organizationId }: OrganizationRequestParams,
    ctx: ServiceContext
  ): Promise<{ success: boolean }> {
    ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Organization');

    const { user } = ctx;
    try {
      await organizationService.setActiveOrganization({ organizationId }, ctx);

      await ctx.emit(PracticeSwitched, {
        user_id: user.id,
        to_organization_id: organizationId,
        user_email: user.email,
        switched_to_organization: organizationId,
      });

      return { success: true };
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      logger.error('Failed to set active practice {organizationId}: {error}', { organizationId, error });
      throw new HTTPException(500, { message: 'Failed to set active practice' });
    }
  },
};
