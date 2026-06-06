import { and, eq, isNull, notInArray, or, sql } from 'drizzle-orm';
import { matterAssignees } from '@/modules/matters/database/schema/matter-assignees.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import {
  practiceMemberProfiles,
  type InsertPracticeMemberProfile,
  type SelectPracticeMemberProfile,
} from '@/modules/practice/database/schema/practice-member-profiles.schema';
import { db } from '@/shared/database';

export type UpsertMemberProfileData = Partial<
  Omit<InsertPracticeMemberProfile, 'id' | 'member_id' | 'created_at' | 'updated_at'>
>;

/**
 * Matter statuses that do NOT count toward an attorney's active caseload. A
 * matter is "active work" until it is closed, declined, or referred away.
 */
const INACTIVE_MATTER_STATUSES = ['closed', 'declined', 'referred'];

const findByMemberId = async (memberId: string): Promise<SelectPracticeMemberProfile | undefined> => {
  const [row] = await db
    .select()
    .from(practiceMemberProfiles)
    .where(eq(practiceMemberProfiles.member_id, memberId))
    .limit(1);
  return row;
};

/**
 * Create the profile if absent, otherwise merge the provided fields onto the
 * existing row (partial update). Atomic via the unique `member_id` constraint.
 */
const upsert = async (memberId: string, data: UpsertMemberProfileData): Promise<SelectPracticeMemberProfile> => {
  const [row] = await db
    .insert(practiceMemberProfiles)
    .values({ member_id: memberId, ...data })
    .onConflictDoUpdate({
      target: practiceMemberProfiles.member_id,
      set: { ...data, updated_at: new Date() },
    })
    .returning();
  return row;
};

/**
 * Count a member's active caseload: non-deleted matters in the organization, in
 * a non-terminal status, where the user is the responsible attorney or an
 * explicit assignee. Distinct so a matter counted via both paths counts once.
 */
const countActiveMatters = async (organizationId: string, userId: string): Promise<number> => {
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${matters.id})` })
    .from(matters)
    .leftJoin(matterAssignees, and(eq(matterAssignees.matter_id, matters.id), eq(matterAssignees.user_id, userId)))
    .where(
      and(
        eq(matters.organization_id, organizationId),
        isNull(matters.deleted_at),
        notInArray(matters.status, INACTIVE_MATTER_STATUSES),
        or(eq(matters.responsible_attorney_id, userId), eq(matterAssignees.user_id, userId))
      )
    );
  return Number(row?.count ?? 0);
};

export const practiceMemberProfilesRepository = {
  findByMemberId,
  upsert,
  countActiveMatters,
};
