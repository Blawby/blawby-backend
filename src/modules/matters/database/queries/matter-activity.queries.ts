import {
  matterActivityLog,
  type SelectMatterActivityLog,
} from '@/modules/matters/database/schema/matter-activity-log.schema';
import type { MatterActivityListFilters } from '@/modules/matters/types/matter-filters.types';
import { getActiveTx } from '@/shared/database/uow';
import { and, desc, eq } from 'drizzle-orm';

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

export const matterActivityQueries = {
  listMatterActivity,
};
