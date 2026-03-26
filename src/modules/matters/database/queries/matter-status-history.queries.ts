import { desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  matterStatusHistory,
  type InsertMatterStatusHistory,
  type SelectMatterStatusHistory,
} from '@/modules/matters/database/schema/matter-status-history.schema';
import type * as schema from '@/schema';
import { db } from '@/shared/database';

const createMatterStatusHistory = async (
  data: InsertMatterStatusHistory,
  tx?: NodePgDatabase<typeof schema>
): Promise<SelectMatterStatusHistory> => {
  const client = tx ?? db;
  const [entry] = await client.insert(matterStatusHistory).values(data).returning();
  if (!entry) {
    throw new Error('Failed to create matter status history entry');
  }
  return entry;
};

const listMatterStatusHistory = async (matterId: string): Promise<SelectMatterStatusHistory[]> => await db
    .select()
    .from(matterStatusHistory)
    .where(eq(matterStatusHistory.matter_id, matterId))
    .orderBy(desc(matterStatusHistory.changed_at));

export const matterStatusHistoryQueries = {
  createMatterStatusHistory,
  listMatterStatusHistory,
};
