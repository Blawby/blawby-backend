/**
 * Matters Service
 *
 * Core business logic for managing legal matters/cases
 */

import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
import { isEqual } from 'es-toolkit';
import { matterMilestonesQueries } from '@/modules/matters/database/queries/matter-milestones.queries';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import type { MatterListFilters } from '@/modules/matters/types/matter-filters.types';
import type {
  CreateMatterRequest,
  UpdateMatterRequest,
  MatterRecord,
  UnbilledMatterData,
} from '@/modules/matters/types/matter.types';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { practiceServicesRepository } from '@/modules/practice/database/queries/practice-services.repository';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import { toSubject } from '@/shared/auth/subject-helpers';
import { db } from '@/shared/database';
import { MatterCreated, MatterUpdated, MatterDeleted, MatterStatusChanged } from '@/shared/events/definitions';
import type { ServiceContext } from '@/shared/types/service-context';
import { matterTimeEntriesQueries } from '@/modules/matters/database/queries/matter-time-entries.queries';
import { matterExpensesQueries } from '@/modules/matters/database/queries/matter-expenses.queries';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';

/**
 * Create a new matter
 */
const createMatter = async (data: CreateMatterRequest, ctx: ServiceContext): Promise<MatterRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Matter');

  const { assignee_ids, milestones, ...matterData } = data;

  if (data.client_id) {
    const client = await clientsRepository.findById(data.client_id);
    if (!client || client.organization_id !== ctx.organizationId) {
      throw new HTTPException(400, { message: 'Invalid client_id or client does not belong to this organization' });
    }
  }

  if (data.practice_service_id) {
    const service = await practiceServicesRepository.findById(data.practice_service_id);
    if (!service || service.organization_id !== ctx.organizationId) {
      throw new HTTPException(400, {
        message: 'Invalid practice_service_id or service does not belong to this organization',
      });
    }
  }

  return db.transaction(async (tx) => {
    const dbData = {
      ...matterData,
      open_date: matterData.open_date ? new Date(matterData.open_date) : undefined,
      close_date: matterData.close_date ? new Date(matterData.close_date) : undefined,
    };

    const [newMatter] = await tx
      .insert(matters)
      .values({ organization_id: ctx.organizationId, ...dbData })
      .returning();

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

    await matterActivityService.logMatterActivity(
      {
        matterId: newMatter.id,
        action: matterActivityService.ActivityAction.MATTER_CREATED,
        description: `Matter "${newMatter.title}" was created`,
        metadata: { billing_type: newMatter.billing_type, status: newMatter.status },
      },
      ctx,
      tx
    );

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
};

/**
 * Lightweight access check for sub-resource endpoints (notes, time entries, expenses, milestones).
 * Uses a minimal DB query — does NOT load relations.
 */
const verifyMatterAccess = async (matterId: string, ctx: ServiceContext): Promise<void> => {
  const matter = await mattersQueries.findMatterById(matterId);

  if (!matter || matter.organization_id !== ctx.organizationId) {
    throw new HTTPException(404, { message: 'Matter not found' });
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', toSubject('Matter', matter));
};

/**
 * Get matter by ID (with full relations — for matter detail view only)
 */
const getMatterById = async (matterId: string, ctx: ServiceContext): Promise<MatterRecord> => {
  const matter = await mattersQueries.findMatterByIdWithRelations(matterId);

  if (!matter || matter.organization_id !== ctx.organizationId) {
    throw new HTTPException(404, { message: 'Matter not found' });
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', toSubject('Matter', matter));

  return {
    ...matter,
    assignees: matter.assignees.map((assignee) => ({
      ...assignee.user,
      name: assignee.user.name ?? '',
    })),
    client: matter.client
      ? { id: matter.client.id, name: matter.client.name ?? '', email: matter.client.email ?? '' }
      : null,
  };
};

/**
 * List matters
 */
const listMatters = async (
  filters: MatterListFilters,
  ctx: ServiceContext
): Promise<{ matters: MatterRecord[]; total: number }> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  return mattersQueries.listMattersByOrganization(ctx.organizationId, filters);
};

/**
 * Update matter
 */
const updateMatter = async (
  matterId: string,
  data: UpdateMatterRequest,
  ctx: ServiceContext
): Promise<MatterRecord> => {
  const existing = await mattersQueries.findMatterByIdWithRelations(matterId);

  if (!existing || existing.organization_id !== ctx.organizationId) {
    throw new HTTPException(404, { message: 'Matter not found' });
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', toSubject('Matter', existing));

  const { assignee_ids, ...matterData } = data;
  const existingRecord: Record<string, unknown> = { ...existing };
  const changedFields = Object.entries(matterData).reduce<string[]>((acc, [key, value]) => {
    if (value === undefined) return acc;
    const existingValue = existingRecord[key];
    const normalizedExisting = existingValue instanceof Date ? existingValue.toISOString() : existingValue;
    if (!isEqual(normalizedExisting, value)) acc.push(key);
    return acc;
  }, []);

  if (assignee_ids !== undefined) {
    const existingAssignees = Array.isArray(existing.assignees)
      ? existing.assignees.map((assignee) => assignee.user.id).filter(Boolean)
      : [];
    const normalizedExisting = [...existingAssignees].sort().join(',');
    const normalizedNext = [...assignee_ids].sort().join(',');
    if (normalizedExisting !== normalizedNext) changedFields.push('assignees');
  }

  if (data.client_id) {
    const client = await clientsRepository.findById(data.client_id);
    if (!client || client.organization_id !== ctx.organizationId) {
      throw new HTTPException(400, { message: 'Invalid client_id or client does not belong to this organization' });
    }
  }

  if (data.practice_service_id) {
    const service = await practiceServicesRepository.findById(data.practice_service_id);
    if (!service || service.organization_id !== ctx.organizationId) {
      throw new HTTPException(400, {
        message: 'Invalid practice_service_id or service does not belong to this organization',
      });
    }
  }

  const organizationName =
    data.status && data.status !== existing.status
      ? ((await organizationRepository.findById(ctx.organizationId))?.name ?? 'Your Legal Team')
      : null;

  const updated = await db.transaction(async (tx) => {
    const dbData = {
      ...matterData,
      open_date: matterData.open_date ? new Date(matterData.open_date) : undefined,
      close_date: matterData.close_date ? new Date(matterData.close_date) : undefined,
    };

    const result = await mattersQueries.updateMatter(matterId, dbData, tx);
    if (!result) {
      throw new HTTPException(500, { message: 'Failed to update matter' });
    }

    if (assignee_ids !== undefined) {
      await mattersQueries.clearMatterAssignees(matterId, tx);
      if (assignee_ids.length > 0) {
        await mattersQueries.addMatterAssignees(matterId, assignee_ids, tx);
      }
    }

    const activityDescription =
      changedFields.length > 0
        ? `Matter "${result.title}" was updated (${changedFields.join(', ')})`
        : `Matter "${result.title}" update attempted (no changes)`;

    await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.MATTER_UPDATED,
        description: activityDescription,
        metadata: { changes: matterData, changed_fields: changedFields },
      },
      ctx,
      tx
    );

    if (data.status && data.status !== existing.status) {
      await matterActivityService.logMatterActivity(
        {
          action: matterActivityService.ActivityAction.MATTER_STATUS_CHANGED,
          description: `Matter status changed from "${existing.status}" to "${data.status}"`,
          metadata: { oldStatus: existing.status, newStatus: data.status, changed_fields: ['status'] },
        },
        ctx,
        tx
      );

      await ctx.emit(
        MatterStatusChanged,
        {
          matter_id: matterId,
          organization_id: ctx.organizationId,
          old_status: existing.status,
          new_status: data.status,
          matter_title: existing.title,
          organization_name: organizationName ?? 'Your Legal Team',
          client_email: existing.client?.email ?? existing.client?.user?.email ?? null,
          client_name: existing.client?.name ?? existing.client?.user?.name ?? null,
        },
        tx
      );
    }

    await ctx.emit(
      MatterUpdated,
      { matter_id: matterId, organization_id: ctx.organizationId, changes: { ...matterData } },
      tx
    );

    return result;
  });

  return updated;
};

/**
 * Delete matter (soft delete)
 */
const deleteMatter = async (matterId: string, ctx: ServiceContext): Promise<void> => {
  const existing = await mattersQueries.findMatterByIdWithRelations(matterId);

  if (!existing || existing.organization_id !== ctx.organizationId) {
    throw new HTTPException(404, { message: 'Matter not found' });
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', toSubject('Matter', existing));

  await db.transaction(async (tx) => {
    const deleted = await mattersQueries.softDeleteMatter(matterId, ctx.userId, tx);
    if (!deleted) {
      throw new HTTPException(500, { message: 'Failed to delete matter' });
    }

    await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.MATTER_DELETED,
        description: `Matter "${deleted.title}" was deleted`,
        metadata: undefined,
      },
      ctx,
      tx
    );

    await ctx.emit(MatterDeleted, { matter_id: matterId, organization_id: ctx.organizationId }, tx);
  });
};

/**
 * Get matter counts by status
 */
const getMatterCounts = async (ctx: ServiceContext): Promise<Record<string, number>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');

  const counts = await mattersQueries.getMatterCountsByStatus(ctx.organizationId);

  return counts.reduce<Record<string, number>>((acc, { status, count }) => {
    acc[status] = count;
    return acc;
  }, {});
};

/**
 * Get matters summary grouped by originating attorney.
 */
const getMattersSummaryByOriginatingAttorney = async (
  _params: Record<string, never>,
  ctx: ServiceContext
): Promise<
  {
    originating_attorney_id: string | null;
    total_matters: number;
    active_matters: number;
    closed_matters: number;
  }[]
> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  return mattersQueries.getMattersSummaryByOriginatingAttorney(ctx.organizationId);
};

const getMatterUnbilled = async (matterId: string, ctx: ServiceContext): Promise<UnbilledMatterData> => {
  await verifyMatterAccess(matterId, ctx);

  const matter = await mattersQueries.findMatterById(matterId);
  if (!matter) {
    throw new HTTPException(404, { message: 'Matter not found' });
  }

  const [timeEntries, expenses, milestones, connectedAccount] = await Promise.all([
    matterTimeEntriesQueries.getUnbilled(matterId),
    matterExpensesQueries.getUnbilled(matterId),
    matterMilestonesQueries.listMatterMilestones(matterId),
    onboardingRepository.findByOrganizationId(ctx.organizationId),
  ]);

  const hourlyRate = matter.attorney_hourly_rate ?? matter.admin_hourly_rate ?? 0;

  return {
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
  };
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
  getMattersSummaryByOriginatingAttorney,
  getMatterUnbilled,
};
