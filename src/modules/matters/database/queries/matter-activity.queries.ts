import {
  matterActivityLog,
  type SelectMatterActivityLog,
} from '@/modules/matters/database/schema/matter-activity-log.schema';
import type { MatterActivityListFilters } from '@/modules/matters/types/matter-filters.types';
import { getActiveTx } from '@/shared/database/uow';
import { and, count, desc, eq } from 'drizzle-orm';

// List activity log entries for a matter (single entry when activityId is set)
const listMatterActivity = async (
  matterId: string,
  filters?: MatterActivityListFilters
): Promise<SelectMatterActivityLog[]> => {
  if (filters?.activityId) {
    const [activity] = await getActiveTx()
      .select()
      .from(matterActivityLog)
      .where(and(eq(matterActivityLog.matter_id, matterId), eq(matterActivityLog.id, filters.activityId)))
      .limit(1);
    return activity ? [activity] : [];
  }

  return getActiveTx()
    .select()
    .from(matterActivityLog)
    .where(eq(matterActivityLog.matter_id, matterId))
    .orderBy(desc(matterActivityLog.created_at))
    .limit(filters?.limit ?? 50)
    .offset(filters?.offset ?? 0);
};

// Page-based listing with total count (single entry when activityId is set)
const listMatterActivityPaginated = async (
  matterId: string,
  filters?: MatterActivityListFilters & { page?: number }
): Promise<{ data: SelectMatterActivityLog[]; total: number; page: number; limit: number }> => {
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 20;
  const offset = (page - 1) * limit;

  if (filters?.activityId) {
    const data = await listMatterActivity(matterId, { activityId: filters.activityId });
    return { data, total: data.length, page, limit };
  }

  const whereClause = eq(matterActivityLog.matter_id, matterId);

  const [data, [countRow]] = await Promise.all([
    getActiveTx()
      .select()
      .from(matterActivityLog)
      .where(whereClause)
      .orderBy(desc(matterActivityLog.created_at))
      .limit(limit)
      .offset(offset),
    getActiveTx().select({ total: count() }).from(matterActivityLog).where(whereClause),
  ]);

  return { data, total: countRow?.total ?? 0, page, limit };
};

export const matterActivityQueries = {
  listMatterActivity,
  listMatterActivityPaginated,
};
