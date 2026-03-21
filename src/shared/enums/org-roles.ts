/**
 * Organization Roles
 */
export enum OrgRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  ATTORNEY = 'attorney',
  PARALEGAL = 'paralegal',
  CLIENT = 'client',
}

/**
 * Roles with administrative privileges
 */
export const ADMIN_ROLES = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ATTORNEY] as const;

/**
 * Roles with restricted/member privileges
 */
export const MEMBER_ROLES = [OrgRole.MEMBER, OrgRole.PARALEGAL] as const;
