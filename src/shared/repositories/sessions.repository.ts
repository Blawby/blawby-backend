import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { sessions } from '@/schema/better-auth-schema';
import { getActiveTx } from '@/shared/database/uow';

const deleteByUserId = async (userId: string): Promise<void> => {
  await getActiveTx().delete(sessions).where(eq(sessions.userId, userId));
};

const findPreviousActiveOrganizationId = async (userId: string): Promise<string | null> => {
  const [previousSession] = await getActiveTx()
    .select({ activeOrganizationId: sessions.activeOrganizationId })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNotNull(sessions.activeOrganizationId)))
    .orderBy(desc(sessions.updatedAt), desc(sessions.createdAt))
    .limit(1);

  return previousSession?.activeOrganizationId ?? null;
};

const setActiveOrganizationId = async (
  sessionId: string,
  activeOrganizationId: string
): Promise<void> => {
  await getActiveTx().update(sessions).set({ activeOrganizationId }).where(eq(sessions.id, sessionId));
};

export const sessionsRepository = {
  deleteByUserId,
  findPreviousActiveOrganizationId,
  setActiveOrganizationId,
};
