import { getLogger } from '@logtape/logtape';
import { isEqual } from 'es-toolkit';
import { matterMilestonesQueries } from '@/modules/matters/database/queries/matter-milestones.queries';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import type {
  CreateMatterRequest,
  UpdateMatterRequest,
  ListMattersQuery,
  MatterResponse,
} from '@/modules/matters/types/matter.types';
import { practiceServicesRepository } from '@/modules/practice/database/queries/practice-services.repository';
import { getFullOrganization } from '@/modules/practice/services/organization.service';
import { userDetailsRepository } from '@/modules/user-details/database/queries/user-details.queries';
import { db } from '@/shared/database';
import {
  MatterCreated,
  MatterUpdated,
  MatterDeleted,
  MatterStatusChanged,
} from '@/shared/events/definitions';
import type { User } from '@/shared/types/BetterAuth';
import type { Result, PaginatedResult } from '@/shared/types/result';
import { result } from '@/shared/utils/result';

const logger = getLogger(['matters', 'service']);

/**
 * Create a matter
 */
const createMatter = async (
  organizationId: string,
  data: CreateMatterRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<MatterResponse>> => {
  // Verify user has access to organization
  const orgResult = await getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) {
    logger.error('Failed to create matter: Organization not found or access denied {organizationId} {userId}', {
      organizationId,
      userId: user.id,
      error: orgResult.error,
    });
    return orgResult;
  }

  // Extract assignees and milestones from data
  const { assignee_ids, milestones, ...matterData } = data;

  // Validate client_id if provided
  if (data.client_id) {
    const client = await userDetailsRepository.findById(data.client_id);
    if (!client || client.organization_id !== organizationId) {
      return result.badRequest('Invalid client_id or client does not belong to this organization');
    }
  }

  // Validate practice_service_id if provided
  if (data.practice_service_id) {
    const service = await practiceServicesRepository.findById(data.practice_service_id);
    if (!service || service.organization_id !== organizationId) {
      return result.badRequest('Invalid practice_service_id or service does not belong to this organization');
    }
  }

  try {
    // Create matter in transaction
    const matter = await db.transaction(async (tx) => {
      // Convert date strings to Date objects
      const dbData = {
        ...matterData,
        open_date: matterData.open_date ? new Date(matterData.open_date) : undefined,
        close_date: matterData.close_date ? new Date(matterData.close_date) : undefined,
      };

      // Create the matter
      const [newMatter] = await tx
        .insert(matters)
        .values({
          organization_id: organizationId,
          ...dbData,
        })
        .returning();

      // Add assignees if provided
      if (assignee_ids && assignee_ids.length > 0) {
        await mattersQueries.addMatterAssignees(newMatter.id, assignee_ids, tx);
      }

      if (milestones && milestones.length > 0) {
        await matterMilestonesQueries.createMatterMilestones(
          milestones.map((milestone) => ({
            matter_id: newMatter.id,
            description: milestone.description,
            amount: milestone.amount,
            due_date: typeof milestone.due_date === 'string' ? milestone.due_date : milestone.due_date.toISOString().split('T')[0],
            order: milestone.order,
            status: 'pending' as const,
          })),
          tx,
        );
      }

      // Log activity
      await matterActivityService.logMatterActivity(
        newMatter.id,
        matterActivityService.ActivityAction.MATTER_CREATED,
        `Matter "${newMatter.title}" was created`,
        user.id,
        { billing_type: newMatter.billing_type, status: newMatter.status },
        tx,
      );

      // Dispatch event
      await MatterCreated.dispatch(
        {
          matter_id: newMatter.id,
          organization_id: organizationId,
          title: newMatter.title,
          billing_type: newMatter.billing_type,
        },
        { tx, actorId: user.id, organizationId },
      );

      return newMatter;
    });

    return result.ok({
      ...matter,
      deleted_at: matter.deleted_at ?? null,
    } as MatterResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create matter {organizationId} {userId}: {error}', {
      organizationId,
      userId: user.id,
      error: message,
    });
    return result.internalError(message);
  }
};

/**
 * Get matter by ID with relations
 */
const getMatterById = async (
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<MatterResponse>> => {
  // Verify user has access to organization
  const orgResult = await getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) {
    logger.error('Failed to get matter: Organization not found or access denied {organizationId} {userId}', {
      organizationId,
      userId: user.id,
      error: orgResult.error,
    });
    return orgResult;
  }

  try {
    const matter = await mattersQueries.findMatterByIdWithRelations(matterId);

    if (!matter || matter.organization_id !== organizationId) {
      logger.warn('Matter not found or does not belong to organization {matterId} {organizationId}', {
        matterId,
        organizationId,
      });
      return result.notFound('Matter not found');
    }

    return result.ok({
      ...matter,
      assignees: matter.assignees.map((a) => a.user),
      deleted_at: matter.deleted_at ?? null,
    } as MatterResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get matter {matterId}: {error}', {
      matterId,
      error: message,
    });
    return result.internalError(message);
  }
};

/**
 * List matters with filters
 */
const listMatters = async (
  organizationId: string,
  filters: ListMattersQuery,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<PaginatedResult<MatterResponse, 'matters'>> => {
  // Verify user has access to organization
  const orgResult = await getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) {
    logger.error('Failed to list matters: Organization not found or access denied {organizationId} {userId}', {
      organizationId,
      userId: user.id,
      error: orgResult.error,
    });
    return orgResult;
  }

  try {
    const listResult = await mattersQueries.listMattersByOrganization(organizationId, {
      status: filters.status,
      practiceServiceId: filters.practice_service_id,
      clientId: filters.client_id,
      matterId: filters.matter_id,
      assigneeId: filters.assignee_id,
      search: filters.search,
      page: filters.page,
      limit: filters.limit,
    });
    return result.ok({
      matters: listResult.matters.map((m) => ({
        ...m,
        deleted_at: m.deleted_at ?? null,
      })) as MatterResponse[],
      total: listResult.total,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list matters {organizationId}: {error}', {
      organizationId,
      error: message,
    });
    return result.internalError(message);
  }
};

/**
 * Update matter
 */
const updateMatter = async (
  organizationId: string,
  matterId: string,
  data: UpdateMatterRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<MatterResponse>> => {
  // Verify access
  const existingResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!existingResult.success) {
    return existingResult;
  }
  const existingMatter = existingResult.data;

  // Extract assignees from data
  const { assignee_ids, ...matterData } = data;
  const changedFields = Object.entries(matterData).reduce<string[]>((acc, [key, value]) => {
    if (value === undefined) return acc;
    const existingValue = (existingMatter as Record<string, unknown>)[key];
    // Normalize dates for comparison (both sides may be Date objects after z.coerce.date())
    const normalizedExisting = existingValue instanceof Date ? existingValue.toISOString() : existingValue;
    const normalizedNext = value instanceof Date ? value.toISOString() : value;
    if (!isEqual(normalizedExisting, normalizedNext)) {
      acc.push(key);
    }
    return acc;
  }, []);
  if (assignee_ids !== undefined) {
    const existingAssignees = Array.isArray(existingMatter.assignees)
      ? existingMatter.assignees.map((assignee) => assignee.id).filter(Boolean)
      : [];
    const normalizedExisting = [...existingAssignees].sort().join(',');
    const normalizedNext = [...assignee_ids].sort().join(',');
    if (normalizedExisting !== normalizedNext) {
      changedFields.push('assignees');
    }
  }

  // Validate client_id if provided
  if (data.client_id) {
    const client = await userDetailsRepository.findById(data.client_id);
    if (!client || client.organization_id !== organizationId) {
      return result.badRequest('Invalid client_id or client does not belong to this organization');
    }
  }

  // Validate practice_service_id if provided
  if (data.practice_service_id) {
    const service = await practiceServicesRepository.findById(data.practice_service_id);
    if (!service || service.organization_id !== organizationId) {
      return result.badRequest('Invalid practice_service_id or service does not belong to this organization');
    }
  }

  try {
    const transactionResult = await db.transaction(async (tx) => {
      // Convert date strings to Date objects
      const dbData = {
        ...matterData,
        open_date: matterData.open_date ? new Date(matterData.open_date) : undefined,
        close_date: matterData.close_date ? new Date(matterData.close_date) : undefined,
      };

      // Update the matter
      const updated = await mattersQueries.updateMatter(matterId, dbData, tx);

      if (!updated) {
        throw new Error('Failed to update matter');
      }

      // Update assignees if provided
      if (assignee_ids !== undefined) {
        // Clear existing assignees and add new ones
        await mattersQueries.clearMatterAssignees(matterId, tx);
        if (assignee_ids.length > 0) {
          await mattersQueries.addMatterAssignees(matterId, assignee_ids, tx);
        }
      }

      // Log activity
      if (changedFields.length > 0) {
        await matterActivityService.logMatterActivity(
          matterId,
          matterActivityService.ActivityAction.MATTER_UPDATED,
          `Matter "${updated.title}" was updated (${changedFields.join(', ')})`,
          user.id,
          { changes: matterData, changed_fields: changedFields },
          tx,
        );
      } else {
        await matterActivityService.logMatterActivity(
          matterId,
          matterActivityService.ActivityAction.MATTER_UPDATED,
          `Matter "${updated.title}" update attempted (no changes)`,
          user.id,
          { changes: matterData, changed_fields: changedFields },
          tx,
        );
      }

      // Check for status change
      if (data.status && data.status !== existingMatter.status) {
        await matterActivityService.logMatterActivity(
          matterId,
          matterActivityService.ActivityAction.MATTER_STATUS_CHANGED,
          `Matter status changed from "${existingMatter.status}" to "${data.status}"`,
          user.id,
          { oldStatus: existingMatter.status, newStatus: data.status, changed_fields: ['status'] },
          tx,
        );

        await MatterStatusChanged.dispatch(
          {
            matter_id: matterId,
            organization_id: organizationId,
            old_status: existingMatter.status,
            new_status: data.status,
          },
          { tx, actorId: user.id, organizationId },
        );
      }

      // Dispatch update event
      await MatterUpdated.dispatch(
        {
          matter_id: matterId,
          organization_id: organizationId,
          changes: matterData as Record<string, unknown>,
        },
        { tx, actorId: user.id, organizationId },
      );

      return updated;
    });

    return result.ok({
      ...transactionResult,
      deleted_at: transactionResult.deleted_at ?? null,
    } as MatterResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update matter {matterId}: {error}', {
      matterId,
      error: message,
    });
    return result.internalError(message);
  }
};

/**
 * Delete matter (soft delete)
 */
const deleteMatter = async (
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ success: true }>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    await db.transaction(async (tx) => {
      const deleted = await mattersQueries.softDeleteMatter(matterId, user.id, tx);

      if (!deleted) {
        throw new Error('Failed to delete matter');
      }

      // Log activity
      await matterActivityService.logMatterActivity(
        matterId,
        matterActivityService.ActivityAction.MATTER_DELETED,
        `Matter "${deleted.title}" was deleted`,
        user.id,
        undefined,
        tx,
      );

      // Dispatch event
      await MatterDeleted.dispatch(
        {
          matter_id: matterId,
          organization_id: organizationId,
        },
        { tx, actorId: user.id, organizationId },
      );

      return deleted;
    });

    return result.ok({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete matter {matterId}: {error}', {
      matterId,
      error: message,
    });
    return result.internalError(message);
  }
};

/**
 * Get matter counts by status
 */
const getMatterCounts = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<Record<string, number>>> => {
  // Verify user has access to organization
  const orgResult = await getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) {
    logger.error('Failed to get matter counts: Organization not found or access denied {organizationId} {userId}', {
      organizationId,
      userId: user.id,
      error: orgResult.error,
    });
    return orgResult;
  }

  try {
    const counts = await mattersQueries.getMatterCountsByStatus(organizationId);

    // Transform to object format
    const transformed = counts.reduce((acc: Record<string, number>, { status, count }) => {
      acc[status] = count;
      return acc;
    }, {} as Record<string, number>);

    return result.ok(transformed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get matter counts {organizationId}: {error}', {
      organizationId,
      error: message,
    });
    return result.internalError(message);
  }
};

export const mattersService = {
  createMatter,
  getMatterById,
  listMatters,
  updateMatter,
  deleteMatter,
  getMatterCounts,
};
