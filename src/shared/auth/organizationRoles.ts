import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, adminAc, ownerAc, memberAc } from 'better-auth/plugins/organization/access';

/**
 * Define custom statements for organization resources
 * Extends default statements with custom resources if needed
 */
const statement = {
  ...defaultStatements,
  // Add custom resources here if needed in the future
} as const;

/**
 * Create access controller with custom statements
 */
export const organizationAccessController = createAccessControl(statement);

/**
 * Default roles from Better Auth
 */
export const ownerRole = organizationAccessController.newRole({
  ...ownerAc.statements,
});

export const adminRole = organizationAccessController.newRole({
  ...adminAc.statements,
});

export const memberRole = organizationAccessController.newRole({
  ...memberAc.statements,
});

/**
 * Custom roles for legal practice management
 */

// Attorney role - similar to admin but specific to legal practice
export const attorneyRole = organizationAccessController.newRole({
  ...adminAc.statements, // Attorneys have admin-level permissions
});

// Paralegal role - limited permissions, can manage some resources
export const paralegalRole = organizationAccessController.newRole({
  ...memberAc.statements, // Paralegals have member-level permissions by default
  // Can add custom permissions here if needed
  // For example: project: ["create", "update"] if you add project resource
});

/**
 * Export all roles for Better Auth configuration
 */
export const organizationRoles = {
  owner: ownerRole,
  admin: adminRole,
  member: memberRole,
  attorney: attorneyRole,
  paralegal: paralegalRole,
};

