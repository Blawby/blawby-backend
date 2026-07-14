import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';

const statement = {
  ...defaultStatements,
  internalConsole: ['read', 'manage'],
} as const;

const ac = createAccessControl(statement);

const userRole = ac.newRole({});

const adminRole = ac.newRole({
  ...adminAc.statements,
});

const supportRole = ac.newRole({
  internalConsole: ['read'],
  user: ['list', 'get'],
});

const opsRole = ac.newRole({
  internalConsole: ['read'],
  user: ['list', 'get', 'ban'],
  session: ['list', 'revoke'],
});

const superAdminRole = ac.newRole({
  ...adminAc.statements,
  user: [...adminAc.statements.user, 'impersonate-admins'],
  internalConsole: ['read', 'manage'],
});

const staffAccessRoles = {
  user: userRole,
  admin: adminRole,
  support: supportRole,
  ops: opsRole,
  super_admin: superAdminRole,
};

const STAFF_ROLES = ['support', 'ops', 'super_admin'] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

const isStaffRole = (role: string): role is StaffRole => STAFF_ROLES.some((staffRole) => staffRole === role);

const parseGlobalRoles = (role: string | null | undefined): string[] =>
  role
    ?.split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0) ?? [];

const getStaffRoles = (role: string | null | undefined): StaffRole[] => parseGlobalRoles(role).filter(isStaffRole);

const isVerifiedStaffUser = (
  user: { email?: string | null; emailVerified?: boolean | null } | null | undefined,
  staffDomain: string
): boolean => {
  const normalizedEmail = user?.email?.toLowerCase();
  const normalizedDomain = staffDomain.toLowerCase();

  return Boolean(normalizedEmail && user?.emailVerified && normalizedEmail.endsWith(`@${normalizedDomain}`));
};

export {
  ac,
  getStaffRoles,
  isStaffRole,
  isVerifiedStaffUser,
  parseGlobalRoles,
  STAFF_ROLES,
  staffAccessRoles,
  statement,
  type StaffRole,
};
