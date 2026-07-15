/**
 * Matters Service
 *
 * Core business logic for managing legal matters/cases
 */

import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
import { isEqual, omit } from 'es-toolkit';
import { matterActivityQueries } from '@/modules/matters/database/queries/matter-activity.queries';
import { matterNotesQueries } from '@/modules/matters/database/queries/matter-notes.queries';
import { matterTasksQueries } from '@/modules/matters/database/queries/matter-tasks.queries';
import { matterMilestonesQueries } from '@/modules/matters/database/queries/matter-milestones.queries';
import { mattersQueries, type MatterWithRelations } from '@/modules/matters/database/queries/matters.queries';
import type { SelectMatterActivityLog } from '@/modules/matters/database/schema/matter-activity-log.schema';
import type { SelectMatterNote } from '@/modules/matters/database/schema/matter-notes.schema';
import type { SelectMatterTask } from '@/modules/matters/database/schema/matter-tasks.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import type {
  MatterActivityListFilters,
  MatterListFilters,
  MatterNoteListFilters,
  MatterTaskListFilters,
} from '@/modules/matters/types/matter-filters.types';
import type {
  ClientMatterRecord,
  CreateMatterRequest,
  UpdateMatterRequest,
  MatterRecord,
  UnbilledMatterData,
} from '@/modules/matters/types/matter.types';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { practiceServicesRepository } from '@/modules/practice/database/queries/practice-services.repository';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import { toSubject } from '@/shared/auth/subject-helpers';
import { getActiveTx, uow } from '@/shared/database/uow';
import type { OffsetPaginatedResponse } from '@/shared/types/pagination';
import { MatterCreated, MatterUpdated, MatterDeleted, MatterStatusChanged } from '@/shared/events/definitions';
import type { ServiceContext } from '@/shared/types/service-context';
import { matterTimeEntriesQueries } from '@/modules/matters/database/queries/matter-time-entries.queries';
import { matterExpensesQueries } from '@/modules/matters/database/queries/matter-expenses.queries';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';

const toMatterRecord = (matter: MatterWithRelations): MatterRecord => ({
  ...matter,
  assignees: matter.assignees.map((assignee) => ({
    ...assignee.user,
    name: assignee.user.name ?? '',
  })),
  client: matter.client
    ? { id: matter.client.id, name: matter.client.name ?? '', email: matter.client.email ?? '' }
    : null,
});

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

  return uow.transaction(async () => {
    const dbData = {
      ...matterData,
      open_date: matterData.open_date ? new Date(matterData.open_date) : undefined,
      close_date: matterData.close_date ? new Date(matterData.close_date) : undefined,
    };

    const [newMatter] = await getActiveTx()
      .insert(matters)
      .values({ organization_id: ctx.organizationId, ...dbData })
      .returning();

    if (assignee_ids && assignee_ids.length > 0) {
      await mattersQueries.addMatterAssignees(newMatter.id, assignee_ids);
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
        }))
      );
    }

    await matterActivityService.logMatterActivity(
      {
        matterId: newMatter.id,
        action: matterActivityService.ActivityAction.MATTER_CREATED,
        description: `Matter "${newMatter.title}" was created`,
        metadata: { billing_type: newMatter.billing_type, status: newMatter.status },
      },
      ctx
    );

    await ctx.emit(MatterCreated, {
      matter_id: newMatter.id,
      organization_id: ctx.organizationId,
      title: newMatter.title,
      billing_type: newMatter.billing_type,
    });

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

  return toMatterRecord(matter);
};

/**
 * List matters
 */
const listMatters = async (
  filters: MatterListFilters,
  ctx: ServiceContext
): Promise<OffsetPaginatedResponse<MatterRecord>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  const { matters: data, total } = await mattersQueries.listMattersByOrganization(ctx.organizationId, filters);
  return {
    data,
    pagination: {
      page: filters.page ?? 1,
      limit: filters.limit ?? 20,
      total,
    },
  };
};

// Strip internal billing, staffing, and conflict-check fields before returning matters to clients
const toClientMatterRecord = (matter: MatterRecord): ClientMatterRecord =>
  omit(matter, [
    'admin_hourly_rate',
    'attorney_hourly_rate',
    'retainer_balance',
    'retainer_cap',
    'retainer_low_balance_threshold',
    'responsible_attorney_id',
    'originating_attorney_id',
    'last_conflict_check_at',
    'last_conflict_check_result',
  ]);

const getAuthenticatedClientId = async (ctx: ServiceContext): Promise<string> => {
  const client = await clientsRepository.findByOrgAndUser(ctx.organizationId, ctx.userId);
  if (!client) {
    throw new HTTPException(404, { message: 'Client record not found in this organization' });
  }
  return client.id;
};

const verifyClientMatterAccess = async (matterId: string, ctx: ServiceContext): Promise<void> => {
  const matter = await mattersQueries.findClientMatterById(matterId, ctx.organizationId, ctx.userId);

  if (!matter) {
    throw new HTTPException(404, { message: 'Matter not found' });
  }
};

const listClientMatters = async (
  filters: MatterListFilters,
  ctx: ServiceContext
): Promise<OffsetPaginatedResponse<ClientMatterRecord>> => {
  const clientId = await getAuthenticatedClientId(ctx);
  const result = await mattersQueries.listMattersByOrganization(ctx.organizationId, { ...filters, clientId });
  return {
    data: result.matters.map(toClientMatterRecord),
    pagination: { page: filters.page ?? 1, limit: filters.limit ?? 20, total: result.total },
  };
};

const getClientMatterById = async (matterId: string, ctx: ServiceContext): Promise<ClientMatterRecord> => {
  await verifyClientMatterAccess(matterId, ctx);

  const matter = await mattersQueries.findMatterByIdWithRelations(matterId);
  if (!matter) {
    throw new HTTPException(404, { message: 'Matter not found' });
  }

  return toClientMatterRecord(toMatterRecord(matter));
};

const getClientMatterActivity = async (
  matterId: string,
  filters: (MatterActivityListFilters & { page?: number }) | undefined,
  ctx: ServiceContext
): Promise<OffsetPaginatedResponse<SelectMatterActivityLog>> => {
  await verifyClientMatterAccess(matterId, ctx);
  const { data, total, page, limit } = await matterActivityQueries.listMatterActivityPaginated(matterId, filters);
  return { data, pagination: { page, limit, total } };
};

const listClientMatterNotes = async (
  matterId: string,
  filters: (MatterNoteListFilters & { page?: number; limit?: number }) | undefined,
  ctx: ServiceContext
): Promise<OffsetPaginatedResponse<SelectMatterNote>> => {
  await verifyClientMatterAccess(matterId, ctx);
  const { data, total, page, limit } = await matterNotesQueries.listMatterNotesPaginated(matterId, filters);
  return { data, pagination: { page, limit, total } };
};

const listClientMatterTasks = async (
  matterId: string,
  filters: (MatterTaskListFilters & { page?: number; limit?: number }) | undefined,
  ctx: ServiceContext
): Promise<OffsetPaginatedResponse<SelectMatterTask>> => {
  await verifyClientMatterAccess(matterId, ctx);
  const { data, total, page, limit } = await matterTasksQueries.listMatterTasksPaginated(matterId, filters);
  return { data, pagination: { page, limit, total } };
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

  const updated = await uow.transaction(async () => {
    const dbData = {
      ...matterData,
      open_date: matterData.open_date ? new Date(matterData.open_date) : undefined,
      close_date: matterData.close_date ? new Date(matterData.close_date) : undefined,
    };

    const result = await mattersQueries.updateMatter(matterId, dbData);
    if (!result) {
      throw new HTTPException(500, { message: 'Failed to update matter' });
    }

    if (assignee_ids !== undefined) {
      await mattersQueries.clearMatterAssignees(matterId);
      if (assignee_ids.length > 0) {
        await mattersQueries.addMatterAssignees(matterId, assignee_ids);
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
      ctx
    );

    if (data.status && data.status !== existing.status) {
      await matterActivityService.logMatterActivity(
        {
          action: matterActivityService.ActivityAction.MATTER_STATUS_CHANGED,
          description: `Matter status changed from "${existing.status}" to "${data.status}"`,
          metadata: { oldStatus: existing.status, newStatus: data.status, changed_fields: ['status'] },
        },
        ctx
      );

      await ctx.emit(MatterStatusChanged, {
        matter_id: matterId,
        organization_id: ctx.organizationId,
        old_status: existing.status,
        new_status: data.status,
        matter_title: existing.title,
        organization_name: organizationName ?? 'Your Legal Team',
        client_email: existing.client?.email ?? existing.client?.user?.email ?? null,
        client_name: existing.client?.name ?? existing.client?.user?.name ?? null,
      });
    }

    await ctx.emit(MatterUpdated, {
      matter_id: matterId,
      organization_id: ctx.organizationId,
      changes: { ...matterData },
    });

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

  await uow.transaction(async () => {
    const deleted = await mattersQueries.softDeleteMatter(matterId, ctx.userId);
    if (!deleted) {
      throw new HTTPException(500, { message: 'Failed to delete matter' });
    }

    await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.MATTER_DELETED,
        description: `Matter "${deleted.title}" was deleted`,
        metadata: undefined,
      },
      ctx
    );

    await ctx.emit(MatterDeleted, { matter_id: matterId, organization_id: ctx.organizationId });
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
  listClientMatters,
  getClientMatterById,
  getClientMatterActivity,
  listClientMatterNotes,
  listClientMatterTasks,
  updateMatter,
  deleteMatter,
  getMatterCounts,
  getMattersSummaryByOriginatingAttorney,
  getMatterUnbilled,
};
