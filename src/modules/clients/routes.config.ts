import type { ModuleConfig } from '@/shared/router/module-router';

export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['requireAuth'],
  },
};

/**
 * Legacy export for backward compatibility if needed within module
 */
export const clientsAuthConfig = {
  // Client CRUD
  'get:/organizations/:orgId/clients': {
    requireOrgMember: true,
    requiredRoles: ['owner', 'admin', 'editor', 'viewer'],
  },
  'post:/organizations/:orgId/clients': {
    requireOrgMember: true,
    requiredRoles: ['owner', 'admin', 'editor'],
  },
  'get:/organizations/:orgId/clients/:uuid': {
    requireOrgMember: true,
    requiredRoles: ['owner', 'admin', 'editor', 'viewer'],
  },
  'put:/organizations/:orgId/clients/:uuid': {
    requireOrgMember: true,
    requiredRoles: ['owner', 'admin', 'editor'],
  },
  'delete:/organizations/:orgId/clients/:uuid': {
    requireOrgMember: true,
    requiredRoles: ['owner', 'admin', 'editor'],
  },

  // Memo CRUD
  'get:/organizations/:orgId/clients/:uuid/memos': {
    requireOrgMember: true,
    requiredRoles: ['owner', 'admin', 'editor', 'viewer'],
  },
  'post:/organizations/:orgId/clients/:uuid/memos': {
    requireOrgMember: true,
    requiredRoles: ['owner', 'admin', 'editor'],
  },
  'put:/organizations/:orgId/clients/:uuid/memos/:memoId': {
    requireOrgMember: true,
    requiredRoles: ['owner', 'admin', 'editor'],
  },
  'delete:/organizations/:orgId/clients/:uuid/memos/:memoId': {
    requireOrgMember: true,
    requiredRoles: ['owner', 'admin', 'editor'],
  },
};
