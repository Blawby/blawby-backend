/**
 * Matters Service
 *
 * Core business logic for managing legal matters/cases
 */

import { ForbiddenError } from '@casl/ability';
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
  MatterRecord,
  UnbilledMatterData,
} from '@/modules/matters/types/matter.types';
import { practiceServicesRepository } from '@/modules/practice/database/queries/practice-services.repository';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import type { Action, Subject } from '@/shared/auth/abilities';
import { toSubject } from '@/shared/auth/subject-helpers';
import { db } from '@/shared/database';
import { MatterCreated, MatterUpdated, MatterDeleted, MatterStatusChanged } from '@/shared/events/definitions';
import type { PaginatedResult, Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';
import { matterTimeEntriesQueries } from '@/modules/matters/database/queries/matter-time-entries.queries';
import { matterExpensesQueries } from '@/modules/matters/database/queries/matter-expenses.queries';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';

const logger = getLogger(['matters', 'services', 'matters']);

const getForbiddenResult = (ctx: ServiceContext, action: Action, subject: Subject): Result<never> | undefined => {
  try {
    ForbiddenError.from(ctx.ability).throwUnlessCan(action, subject);
    return undefined;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return result.forbidden(error.message);
    }
    throw error;
  }
};

/**
 * Create a new matter
 */
const createMatter = async (data: CreateMatterRequest, ctx: ServiceContext): Promise<Result<MatterRecord>> => {
  const forbiddenResult = getForbiddenResult(ctx, 'create', 'Matter');
  if (forbiddenResult) {
    return forbiddenResult;
  }

  // Extract assignees and milestones from data
  const { assignee_ids, milestones, ...matterData } = data;

  // Validate client_id if provided
  if (data.client_id) {
    const client = await clientsRepository.findById(data.client_id);
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
  const matterResult = await db.transaction(async (tx) => {
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
          due_date: milestone.due_date,
          order: milestone.order,
          status: 'pending' as const,
        })),
        tx
      );
    }

    const creationActivityResult = await matterActivityService.logMatterActivity(
      {
        matterId: newMatter.id,
        action: matterActivityService.ActivityAction.MATTER_CREATED,
        description: `Matter "${newMatter.title}" was created`,
        metadata: { billing_type: newMatter.billing_type, status: newMatter.status },
      },
      ctx,
      tx
    );
    if (!creationActivityResult.success) {
      logger.error('Failed to log matter create activity {matterId}: {error}', {
        matterId: newMatter.id,
        error: creationActivityResult.error.message,
      });
    }

    // Dispatch event using ctx.emit
    await ctx.emit(
      MatterCreated,
      {
        matter_id: newMatter.id,
        organization_id: ctx.organizationId,
        title: newMatter.title,
        billing_type: newMatter.billing_type,
      },
      tx
    );

    return newMatter;
  });

  return result.ok<MatterRecord>(matterResult);
};

/**
 * Lightweight access check for sub-resource endpoints (notes, time entries, expenses, milestones).
 * Uses a minimal DB query — does NOT load relations.
 */
const verifyMatterAccess = async (matterId: string, ctx: ServiceContext): Promise<Result<void>> => {
  const matter = await mattersQueries.findMatterById(matterId);

  if (!matter || matter.organization_id !== ctx.organizationId) {
    return result.notFound('Matter not found');
  }

  const forbiddenResult = getForbiddenResult(ctx, 'read', toSubject('Matter', matter));
  if (forbiddenResult) {
    return forbiddenResult;
  }

  return result.ok();
};

/**
 * Get matter by ID (with full relations — for matter detail view only)
 */
const getMatterById = async (matterId: string, ctx: ServiceContext): Promise<Result<MatterRecord>> => {
  const matter = await mattersQueries.findMatterByIdWithRelations(matterId);

  if (!matter || matter.organization_id !== ctx.organizationId) {
    return result.notFound('Matter not found');
  }

  const forbiddenResult = getForbiddenResult(ctx, 'read', toSubject('Matter', matter));
  if (forbiddenResult) {
    return forbiddenResult;
  }

  return result.ok<MatterRecord>({
    ...matter,
    assignees: matter.assignees.map((assignee) => ({
      ...assignee.user,
      name: assignee.user.name ?? '',
    })),
    client: matter.client
      ? { id: matter.client.id, name: matter.client.name ?? '', email: matter.client.email ?? '' }
      : null,
  });
};

/**
 * List matters
 */
const listMatters = async (
  filters: ListMattersQuery,
  ctx: ServiceContext
): Promise<PaginatedResult<MatterRecord, 'matters'>> => {
  const forbiddenResult = getForbiddenResult(ctx, 'read', 'Matter');
  if (forbiddenResult) {
    return forbiddenResult;
  }

  const listResult = await mattersQueries.listMattersByOrganization(ctx.organizationId, {
    status: filters.status,
    practiceServiceId: filters.practice_service_id,
    clientId: filters.client_id,
    assigneeId: filters.assignee_id,
    search: filters.search,
    page: filters.page,
    limit: filters.limit,
  });

  return result.ok({
    matters: listResult.matters,
    total: listResult.total,
  });
};

/**
 * Update matter
 */
const updateMatter = async (
  matterId: string,
  data: UpdateMatterRequest,
  ctx: ServiceContext
): Promise<Result<MatterRecord>> => {
  // 1. Fetch existing for authorization
  const existing = await mattersQueries.findMatterByIdWithRelations(matterId);

  if (!existing || existing.organization_id !== ctx.organizationId) {
    return result.notFound('Matter not found');
  }

  const forbiddenResult = getForbiddenResult(ctx, 'update', toSubject('Matter', existing));
  if (forbiddenResult) {
    return forbiddenResult;
  }

  // Extract assignees from data
  const { assignee_ids, ...matterData } = data;
  const existingRecord: Record<string, unknown> = { ...existing };
  const changedFields = Object.entries(matterData).reduce<string[]>((acc, [key, value]) => {
    if (value === undefined) {
      return acc;
    }
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
    const client = await clientsRepository.findById(data.client_id);
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
      return null;
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
      const updateActivityResult = await matterActivityService.logMatterActivity(
        {
          action: matterActivityService.ActivityAction.MATTER_UPDATED,
          description: `Matter "${updated.title}" was updated (${changedFields.join(', ')})`,
          metadata: { changes: matterData, changed_fields: changedFields },
        },
        ctx,
        tx
      );
      if (!updateActivityResult.success) {
        logger.error('Failed to log matter update activity {matterId}: {error}', {
          matterId,
          error: updateActivityResult.error.message,
        });
      }
    } else {
      const noChangeActivityResult = await matterActivityService.logMatterActivity(
        {
          action: matterActivityService.ActivityAction.MATTER_UPDATED,
          description: `Matter "${updated.title}" update attempted (no changes)`,
          metadata: { changes: matterData, changed_fields: changedFields },
        },
        ctx,
        tx
      );
      if (!noChangeActivityResult.success) {
        logger.error('Failed to log no-change update activity {matterId}: {error}', {
          matterId,
          error: noChangeActivityResult.error.message,
        });
      }
    }

    // Check for status change
    if (data.status && data.status !== existing.status) {
      const statusActivityResult = await matterActivityService.logMatterActivity(
        {
          action: matterActivityService.ActivityAction.MATTER_STATUS_CHANGED,
          description: `Matter status changed from "${existing.status}" to "${data.status}"`,
          metadata: { oldStatus: existing.status, newStatus: data.status, changed_fields: ['status'] },
        },
        ctx,
        tx
      );
      if (!statusActivityResult.success) {
        logger.error('Failed to log status-change activity {matterId}: {error}', {
          matterId,
          error: statusActivityResult.error.message,
        });
      }

      await ctx.emit(
        MatterStatusChanged,
        {
          matter_id: matterId,
          organization_id: ctx.organizationId,
          old_status: existing.status,
          new_status: data.status,
        },
        tx
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
      tx
    );

    return updated;
  });

  if (!transactionResult) {
    return result.internalError('Failed to update matter');
  }

  return result.ok<MatterRecord>(transactionResult);
};

/**
 * Delete matter (soft delete)
 */
const deleteMatter = async (matterId: string, ctx: ServiceContext): Promise<Result<{ success: true }>> => {
  // 1. Fetch for authorization
  const existing = await mattersQueries.findMatterByIdWithRelations(matterId);

  if (!existing || existing.organization_id !== ctx.organizationId) {
    return result.notFound('Matter not found');
  }

  const forbiddenResult = getForbiddenResult(ctx, 'delete', toSubject('Matter', existing));
  if (forbiddenResult) {
    return forbiddenResult;
  }

  const deletedMatter = await db.transaction(async (tx) => {
    const deleted = await mattersQueries.softDeleteMatter(matterId, ctx.userId, tx);
    if (!deleted) {
      return null;
    }

    // Log activity
    const deleteActivityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.MATTER_DELETED,
        description: `Matter "${deleted.title}" was deleted`,
        metadata: undefined,
      },
      ctx,
      tx
    );
    if (!deleteActivityResult.success) {
      logger.error('Failed to log matter delete activity {matterId}: {error}', {
        matterId,
        error: deleteActivityResult.error.message,
      });
    }

    // Dispatch event
    await ctx.emit(
      MatterDeleted,
      {
        matter_id: matterId,
        organization_id: ctx.organizationId,
      },
      tx
    );

    return deleted;
  });

  if (!deletedMatter) {
    return result.internalError('Failed to delete matter');
  }

  return result.ok({ success: true });
};

/**
 * Get matter counts by status
 */
const getMatterCounts = async (ctx: ServiceContext): Promise<Result<Record<string, number>>> => {
  const forbiddenResult = getForbiddenResult(ctx, 'read', 'Matter');
  if (forbiddenResult) {
    return forbiddenResult;
  }

  const counts = await mattersQueries.getMatterCountsByStatus(ctx.organizationId);

  // Transform to object format
  const transformed = counts.reduce<Record<string, number>>((acc: Record<string, number>, { status, count }) => {
    acc[status] = count;
    return acc;
  }, {});

  return result.ok(transformed);
};

const getMatterUnbilled = async (matterId: string, ctx: ServiceContext): Promise<Result<UnbilledMatterData>> => {
  const accessResult = await verifyMatterAccess(matterId, ctx);
  if (!accessResult.success) {
    return accessResult;
  }

  const matter = await mattersQueries.findMatterById(matterId);
  if (!matter) {
    return result.notFound('Matter not found');
  }

  const [timeEntries, expenses, milestones, connectedAccount] = await Promise.all([
    matterTimeEntriesQueries.getUnbilled(matterId),
    matterExpensesQueries.getUnbilled(matterId),
    matterMilestonesQueries.listMatterMilestones(matterId),
    onboardingRepository.findByOrganizationId(ctx.organizationId),
  ]);

  const hourlyRate = matter.attorney_hourly_rate ?? matter.admin_hourly_rate ?? 0;

  return result.ok({
    time_entries: timeEntries.map((entry) => {
      const durationMinutes = Math.round(entry.duration / 60);
      return {
        id: entry.id,
        description: entry.description,
        duration_minutes: durationMinutes,
        hourly_rate: hourlyRate,
        total: Math.round((entry.duration / 3600) * hourlyRate),
        created_at: entry.created_at.toISOString(),
        user_id: entry.user_id ?? null,
      };
    }),
    expenses: expenses.map((expense) => ({
      id: expense.id,
      description: expense.description,
      amount: expense.amount,
      created_at: expense.created_at.toISOString(),
    })),
    milestones: milestones
      .filter((m) => !m.invoiced_at && m.status !== 'paid')
      .map((milestone) => ({
        id: milestone.id,
        description: milestone.description,
        amount: milestone.amount,
        status: milestone.status,
        due_date: milestone.due_date ?? null,
        order: milestone.order,
      })),
    connected_account_id: connectedAccount?.id ?? null,
  });
};

/**
 * Matters Service Export
 */
export const mattersService = {
  createMatter,
  getMatterById,
  verifyMatterAccess,
  listMatters,
  updateMatter,
  deleteMatter,
  getMatterCounts,
  getMatterUnbilled,
};
