import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { sessions } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const deleteByUserId = async (userId: string, tx: DbOrTx = db): Promise<void> => {
  await tx.delete(sessions).where(eq(sessions.userId, userId));
};

const findPreviousActiveOrganizationId = async (userId: string, tx: DbOrTx = db): Promise<string | null> => {
  const [previousSession] = await tx
    .select({ activeOrganizationId: sessions.activeOrganizationId })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNotNull(sessions.activeOrganizationId)))
    .orderBy(desc(sessions.updatedAt), desc(sessions.createdAt))
    .limit(1);

  return previousSession?.activeOrganizationId ?? null;
};

const setActiveOrganizationId = async (
  sessionId: string,
  activeOrganizationId: string,
  tx: DbOrTx = db
): Promise<void> => {
  await tx.update(sessions).set({ activeOrganizationId }).where(eq(sessions.id, sessionId));
};

export const sessionsRepository = {
  deleteByUserId,
  findPreviousActiveOrganizationId,
  setActiveOrganizationId,
};
