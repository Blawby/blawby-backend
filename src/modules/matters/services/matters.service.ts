/**
 * Matters Service
 *
 * Core business logic for managing legal matters/cases
 */

import { ForbiddenError } from '@casl/ability';
import { isEqual } from 'es-toolkit';
import { matterMilestonesQueries } from '@/modules/matters/database/queries/matter-milestones.queries';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import type {
  CreateMatterRequest,
  UpdateMatterRequest,
  ListMattersQuery,
  MatterRecord,
} from '@/modules/matters/types/matter.types';
import { practiceServicesRepository } from '@/modules/practice/database/queries/practice-services.repository';
import { userDetailsRepository } from '@/modules/user-details/database/queries/user-details.queries';
import { toSubject } from '@/shared/auth/subject-helpers';
import { db } from '@/shared/database';
import {
  MatterCreated,
  MatterUpdated,
  MatterDeleted,
  MatterStatusChanged,
} from '@/shared/events/definitions';
import type { PaginatedResult, Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

/**
 * Create a new matter
 */
const createMatter = async (
  data: CreateMatterRequest,
  ctx: ServiceContext,
): Promise<Result<MatterRecord>> => {
  // CASL Check
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Matter');

  // Extract assignees and milestones from data
  const { assignee_ids, milestones, ...matterData } = data;

  // Validate client_id if provided
  if (data.client_id) {
    const client = await userDetailsRepository.findById(data.client_id);
    if (!client || client.organization_id !== ctx.organizationId) {
      return result.badRequest('Invalid client_id or client does not belong to this organization');
    }
  }

  // Validate practice_service_id if provided
  if (data.practice_service_id) {
    const service = await practiceServicesRepository.findById(data.practice_service_id);
    if (!service || service.organization_id !== ctx.organizationId) {
      return result.badRequest('Invalid practice_service_id or service does not belong to this organization');
    }
  }

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
        organization_id: ctx.organizationId,
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

    await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.MATTER_CREATED,
        description: `Matter "${newMatter.title}" was created`,
        metadata: { billing_type: newMatter.billing_type, status: newMatter.status },
      },
      ctx,
      tx,
    );

    // Dispatch event using ctx.emit
    await ctx.emit(
      MatterCreated,
      {
        matter_id: newMatter.id,
        organization_id: ctx.organizationId,
        title: newMatter.title,
        billing_type: newMatter.billing_type,
      },
      tx,
    );

    return newMatter;
  });

  return result.ok({
    ...matter,
  } as MatterRecord);
};

/**
 * Get matter by ID
 */
const getMatterById = async (
  matterId: string,
  ctx: ServiceContext,
): Promise<Result<MatterRecord>> => {
  const matter = await mattersQueries.findMatterByIdWithRelations(matterId);

  if (!matter || matter.organization_id !== ctx.organizationId) {
    return result.notFound('Matter not found');
  }

  // CASL Check
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', toSubject('Matter', matter));

  return result.ok({
    ...matter,
    assignees: matter.assignees.map((a) => a.user),
  } as MatterRecord);
};

/**
 * List matters
 */
const listMatters = async (
  filters: ListMattersQuery,
  ctx: ServiceContext,
): Promise<PaginatedResult<MatterRecord, 'matters'>> => {
  // CASL Check - check capability to read matters generally
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');

  const listResult = await mattersQueries.listMattersByOrganization(ctx.organizationId, {
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
    matters: listResult.matters as MatterRecord[],
    total: listResult.total,
  });
};

/**
 * Update matter
 */
const updateMatter = async (
  matterId: string,
  data: UpdateMatterRequest,
  ctx: ServiceContext,
): Promise<Result<MatterRecord>> => {
  // 1. Fetch existing for authorization
  const existing = await mattersQueries.findMatterByIdWithRelations(matterId);

  if (!existing || existing.organization_id !== ctx.organizationId) {
    return result.notFound('Matter not found');
  }

  // CASL Check
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', toSubject('Matter', existing));

  // Extract assignees from data
  const { assignee_ids, ...matterData } = data;
  const existingRecord: Record<string, unknown> = { ...existing };
  const changedFields = Object.entries(matterData).reduce<string[]>((acc, [key, value]) => {
    if (value === undefined) return acc;
    const existingValue = existingRecord[key];
    // Normalize dates for comparison (existing values from DB are Date objects)
    const normalizedExisting = existingValue instanceof Date ? existingValue.toISOString() : existingValue;
    if (!isEqual(normalizedExisting, value)) {
      acc.push(key);
    }
    return acc;
  }, []);

  if (assignee_ids !== undefined) {
    const existingAssignees = Array.isArray(existing.assignees)
      ? existing.assignees.map((assignee) => assignee.user.id).filter(Boolean)
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
    if (!client || client.organization_id !== ctx.organizationId) {
      return result.badRequest('Invalid client_id or client does not belong to this organization');
    }
  }

  // Validate practice_service_id if provided
  if (data.practice_service_id) {
    const service = await practiceServicesRepository.findById(data.practice_service_id);
    if (!service || service.organization_id !== ctx.organizationId) {
      return result.badRequest('Invalid practice_service_id or service does not belong to this organization');
    }
  }

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
        {
          action: matterActivityService.ActivityAction.MATTER_UPDATED,
          description: `Matter "${updated.title}" was updated (${changedFields.join(', ')})`,
          metadata: { changes: matterData, changed_fields: changedFields },
        },
        ctx,
        tx,
      );
    } else {
      await matterActivityService.logMatterActivity(
        {
          action: matterActivityService.ActivityAction.MATTER_UPDATED,
          description: `Matter "${updated.title}" update attempted (no changes)`,
          metadata: { changes: matterData, changed_fields: changedFields },
        },
        ctx,
        tx,
      );
    }

    // Check for status change
    if (data.status && data.status !== existing.status) {
      await matterActivityService.logMatterActivity(
        {
          action: matterActivityService.ActivityAction.MATTER_STATUS_CHANGED,
          description: `Matter status changed from "${existing.status}" to "${data.status}"`,
          metadata: { oldStatus: existing.status, newStatus: data.status, changed_fields: ['status'] },
        },
        ctx,
        tx,
      );

      await ctx.emit(
        MatterStatusChanged,
        {
          matter_id: matterId,
          organization_id: ctx.organizationId,
          old_status: existing.status,
          new_status: data.status,
        },
        tx,
      );
    }

    // Dispatch update event
    await ctx.emit(
      MatterUpdated,
      {
        matter_id: matterId,
        organization_id: ctx.organizationId,
        changes: { ...matterData },
      },
      tx,
    );

    return updated;
  });

  return result.ok({
    ...transactionResult,
  } as MatterRecord);
};

/**
 * Delete matter (soft delete)
 */
const deleteMatter = async (
  matterId: string,
  ctx: ServiceContext,
): Promise<Result<{ success: true }>> => {
  // 1. Fetch for authorization
  const existing = await mattersQueries.findMatterByIdWithRelations(matterId);

  if (!existing || existing.organization_id !== ctx.organizationId) {
    return result.notFound('Matter not found');
  }

  // CASL Check
  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', toSubject('Matter', existing));

  await db.transaction(async (tx) => {
    const deletedMatter = await mattersQueries.softDeleteMatter(matterId, ctx.userId, tx);

    if (!deletedMatter) {
      throw new Error('Failed to delete matter');
    }

    // Log activity
    await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.MATTER_DELETED,
        description: `Matter "${deletedMatter.title}" was deleted`,
        metadata: undefined,
      },
      ctx,
      tx,
    );

    // Dispatch event
    await ctx.emit(
      MatterDeleted,
      {
        matter_id: matterId,
        organization_id: ctx.organizationId,
      },
      tx,
    );

    return deletedMatter;
  });

  return result.ok({ success: true });
};

/**
 * Get matter counts by status
 */
const getMatterCounts = async (
  ctx: ServiceContext,
): Promise<Result<Record<string, number>>> => {
  // CASL Check - generally read matters
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');

  const counts = await mattersQueries.getMatterCountsByStatus(ctx.organizationId);

  // Transform to object format
  const transformed = counts.reduce((acc: Record<string, number>, { status, count }) => {
    acc[status] = count;
    return acc;
  }, {} as Record<string, number>);

  return result.ok(transformed);
};

/**
 * Matters Service Export
 */
export const mattersService = {
  createMatter,
  getMatterById,
  listMatters,
  updateMatter,
  deleteMatter,
  getMatterCounts,
};

export default mattersService;
