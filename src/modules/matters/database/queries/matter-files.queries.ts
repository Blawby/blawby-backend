import { and, eq } from 'drizzle-orm';

import { db } from '@/shared/database';
import { uploads } from '@/shared/uploads/schema/uploads.schema';
import type { ServiceContext } from '@/shared/types/service-context';
import { matterFiles, type InsertMatterFile } from '@/modules/matters/database/schema/matter-files.schema';

type DbExecutor = ServiceContext['db'];

export const matterFilesQueries = {
  createLink: async (data: InsertMatterFile, executor: DbExecutor = db) => {
    const [row] = await executor
      .insert(matterFiles)
      .values(data)
      .onConflictDoNothing({ target: [matterFiles.matter_id, matterFiles.upload_id] })
      .returning();

    return row;
  },

  findLink: async (matterId: string, uploadId: string, executor: DbExecutor = db) => {
    const [row] = await executor
      .select()
      .from(matterFiles)
      .where(and(eq(matterFiles.matter_id, matterId), eq(matterFiles.upload_id, uploadId)))
      .limit(1);

    return row;
  },

  listByMatter: async (matterId: string, executor: DbExecutor = db) =>
    executor
      .select({
        link_id: matterFiles.id,
        linked_at: matterFiles.linked_at,
        linked_by: matterFiles.linked_by,
        upload: uploads,
      })
      .from(matterFiles)
      .innerJoin(uploads, eq(matterFiles.upload_id, uploads.id))
      .where(eq(matterFiles.matter_id, matterId)),

  deleteLink: async (matterId: string, uploadId: string, executor: DbExecutor = db) => {
    const [row] = await executor
      .delete(matterFiles)
      .where(and(eq(matterFiles.matter_id, matterId), eq(matterFiles.upload_id, uploadId)))
      .returning();

    return row;
  },
};
