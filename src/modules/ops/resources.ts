import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { invitations, organizations, users } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';
import {
  loadPracticeResponseById,
  loadPracticeResponsesForOrganizationIds,
} from '@/modules/practice/services/practice-response.loader';
import type { OpsListParams, OpsResource } from '@/modules/ops/types';

const toSearchPattern = (q: string | null): string | null => (q ? `%${q.trim()}%` : null);

const listPractices: OpsResource['list'] = async ({ limit, offset, q }) => {
  const searchPattern = toSearchPattern(q);
  const where = searchPattern ? or(ilike(organizations.name, searchPattern), ilike(organizations.slug, searchPattern)) : undefined;

  const idsQuery = db
    .select({ id: organizations.id })
    .from(organizations)
    .$dynamic();
  const totalQuery = db
    .select({ total: count() })
    .from(organizations)
    .$dynamic();

  if (where) {
    idsQuery.where(where);
    totalQuery.where(where);
  }

  const [rows, totalRows] = await Promise.all([
    idsQuery.orderBy(desc(organizations.createdAt)).limit(limit).offset(offset),
    totalQuery,
  ]);
  const data = await loadPracticeResponsesForOrganizationIds(rows.map((row) => row.id));

  return {
    data,
    total: totalRows.at(0)?.total ?? 0,
  };
};

const getPractice: OpsResource['get'] = async (id) => loadPracticeResponseById(id);

const listUsers: OpsResource['list'] = async ({ limit, offset, q }) => {
  const searchPattern = toSearchPattern(q);
  const where = searchPattern ? or(ilike(users.email, searchPattern), ilike(users.name, searchPattern)) : undefined;

  const rowsQuery = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      email_verified: users.emailVerified,
      image: users.image,
      phone: users.phone,
      role: users.role,
      banned: users.banned,
      ban_reason: users.banReason,
      ban_expires: users.banExpires,
      onboarding_complete: users.onboardingComplete,
      created_at: users.createdAt,
      updated_at: users.updatedAt,
    })
    .from(users)
    .$dynamic();
  const totalQuery = db
    .select({ total: count() })
    .from(users)
    .$dynamic();

  if (where) {
    rowsQuery.where(where);
    totalQuery.where(where);
  }

  const [rows, totalRows] = await Promise.all([
    rowsQuery.orderBy(desc(users.createdAt)).limit(limit).offset(offset),
    totalQuery,
  ]);

  return {
    data: rows,
    total: totalRows.at(0)?.total ?? 0,
  };
};

const getUser: OpsResource['get'] = async (id) => {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      email_verified: users.emailVerified,
      image: users.image,
      phone: users.phone,
      role: users.role,
      banned: users.banned,
      ban_reason: users.banReason,
      ban_expires: users.banExpires,
      onboarding_complete: users.onboardingComplete,
      created_at: users.createdAt,
      updated_at: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return row ?? null;
};

const listPracticeInvitations: NonNullable<OpsResource['relations']>[string]['list'] = async (
  practiceId,
  { limit, offset, q, status }
) => {
  const searchPattern = toSearchPattern(q);
  const invitationStatus = status ?? 'pending';
  const where = and(
    eq(invitations.organizationId, practiceId),
    searchPattern ? ilike(invitations.email, searchPattern) : undefined,
    eq(invitations.status, invitationStatus)
  );

  const rowsQuery = db
    .select({
      id: invitations.id,
      organization_id: invitations.organizationId,
      organization_name: organizations.name,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expires_at: invitations.expiresAt,
      created_at: invitations.createdAt,
      inviter_id: users.id,
      inviter_name: users.name,
      inviter_email: users.email,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .innerJoin(users, eq(users.id, invitations.inviterId))
    .where(where)
    .orderBy(desc(invitations.createdAt))
    .limit(limit)
    .offset(offset);
  const totalQuery = db.select({ total: count() }).from(invitations).where(where);

  const [rows, totalRows] = await Promise.all([rowsQuery, totalQuery]);

  return {
    data: rows.map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
      organization_name: row.organization_name,
      email: row.email,
      role: row.role,
      status: row.status,
      expires_at: row.expires_at.getTime(),
      created_at: row.created_at.getTime(),
      inviter: {
        id: row.inviter_id,
        name: row.inviter_name,
        email: row.inviter_email,
      },
    })),
    total: totalRows.at(0)?.total ?? 0,
  };
};

const opsResources: Record<string, OpsResource> = {
  practices: {
    name: 'practices',
    list: listPractices,
    get: getPractice,
    relations: {
      invitations: {
        list: listPracticeInvitations,
      },
    },
  },
  users: {
    name: 'users',
    list: listUsers,
    get: getUser,
  },
};

export const getOpsResource = (name: string): OpsResource | null => opsResources[name] ?? null;
