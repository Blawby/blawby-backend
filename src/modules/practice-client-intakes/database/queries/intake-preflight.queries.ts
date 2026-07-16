import { matterAssignees } from '@/modules/matters/database/schema/matter-assignees.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { practiceMemberProfiles } from '@/modules/practice/database/schema/practice-member-profiles.schema';
import { members } from '@/schema/better-auth-schema';
import { getActiveTx } from '@/shared/database/uow';
import { and, asc, eq, isNull, notInArray } from 'drizzle-orm';

const TERMINAL_MATTER_STATUSES = ['closed', 'declined', 'referred'];

const listRoutingProfiles = async (organizationId: string) =>
  getActiveTx()
    .select({
      user_id: members.userId,
      practice_areas: practiceMemberProfiles.practice_areas,
      max_capacity: practiceMemberProfiles.max_capacity,
      accepting_clients: practiceMemberProfiles.accepting_clients,
    })
    .from(practiceMemberProfiles)
    .innerJoin(
      members,
      and(eq(practiceMemberProfiles.member_id, members.id), eq(members.organizationId, organizationId))
    )
    .orderBy(asc(members.userId));

const listActiveMatterAssignments = async (organizationId: string) =>
  getActiveTx()
    .select({
      matter_id: matters.id,
      responsible_attorney_id: matters.responsible_attorney_id,
      assignee_user_id: matterAssignees.user_id,
    })
    .from(matters)
    .leftJoin(matterAssignees, eq(matterAssignees.matter_id, matters.id))
    .where(
      and(
        eq(matters.organization_id, organizationId),
        isNull(matters.deleted_at),
        notInArray(matters.status, TERMINAL_MATTER_STATUSES)
      )
    )
    .orderBy(asc(matters.id));

export const intakePreflightQueries = {
  listRoutingProfiles,
  listActiveMatterAssignments,
};
