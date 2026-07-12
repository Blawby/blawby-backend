import { checkStaffRoleGrant } from '@/shared/auth/staff-role-guard';
import { describe, expect, it } from 'vitest';

const STAFF_DOMAIN = 'blawby.com';

const staffTarget = { role: 'user', email: 'target@blawby.com', emailVerified: true };
const tenantTarget = { role: 'user', email: 'owner@lawfirm.com', emailVerified: true };

describe('checkStaffRoleGrant', () => {
  it('allows non-staff role changes without super_admin caller', () => {
    const result = checkStaffRoleGrant({
      requestedRoles: ['admin'],
      caller: { role: 'admin' },
      target: tenantTarget,
      staffDomain: STAFF_DOMAIN,
    });

    expect(result).toEqual({ allowed: true });
  });

  it('blocks staff grant when caller is not super_admin', () => {
    const result = checkStaffRoleGrant({
      requestedRoles: ['user', 'support'],
      caller: { role: 'admin' },
      target: staffTarget,
      staffDomain: STAFF_DOMAIN,
    });

    expect(result.allowed).toBe(false);
  });

  it('blocks staff grant to a non-staff-domain target even from super_admin', () => {
    const result = checkStaffRoleGrant({
      requestedRoles: ['user', 'super_admin'],
      caller: { role: 'user,super_admin' },
      target: tenantTarget,
      staffDomain: STAFF_DOMAIN,
    });

    expect(result.allowed).toBe(false);
  });

  it('blocks staff grant to an unverified staff-domain target', () => {
    const result = checkStaffRoleGrant({
      requestedRoles: ['user', 'ops'],
      caller: { role: 'user,super_admin' },
      target: { role: 'user', email: 'new@blawby.com', emailVerified: false },
      staffDomain: STAFF_DOMAIN,
    });

    expect(result.allowed).toBe(false);
  });

  it('blocks staff grant when target user is not found', () => {
    const result = checkStaffRoleGrant({
      requestedRoles: ['support'],
      caller: { role: 'user,super_admin' },
      target: null,
      staffDomain: STAFF_DOMAIN,
    });

    expect(result.allowed).toBe(false);
  });

  it('allows staff grant from super_admin to verified staff-domain target', () => {
    const result = checkStaffRoleGrant({
      requestedRoles: ['user', 'support'],
      caller: { role: 'user,super_admin' },
      target: staffTarget,
      staffDomain: STAFF_DOMAIN,
    });

    expect(result).toEqual({ allowed: true });
  });

  it('treats a comma-separated requested role string the same as a role array', () => {
    const result = checkStaffRoleGrant({
      requestedRoles: ['user,support'],
      caller: { role: 'super_admin' },
      target: staffTarget,
      staffDomain: STAFF_DOMAIN,
    });

    expect(result).toEqual({ allowed: true });
  });

  it('blocks demotion of an existing staff user by a non-super_admin caller', () => {
    const result = checkStaffRoleGrant({
      requestedRoles: ['user'],
      caller: { role: 'admin' },
      target: { role: 'user,ops', email: 'staffer@blawby.com', emailVerified: true },
      staffDomain: STAFF_DOMAIN,
    });

    expect(result.allowed).toBe(false);
  });

  it('allows demotion of an existing staff user by a super_admin caller', () => {
    const result = checkStaffRoleGrant({
      requestedRoles: ['user'],
      caller: { role: 'user,super_admin' },
      target: { role: 'user,ops', email: 'staffer@blawby.com', emailVerified: true },
      staffDomain: STAFF_DOMAIN,
    });

    expect(result).toEqual({ allowed: true });
  });

  it('blocks staff grant when caller is null', () => {
    const result = checkStaffRoleGrant({
      requestedRoles: ['super_admin'],
      caller: null,
      target: staffTarget,
      staffDomain: STAFF_DOMAIN,
    });

    expect(result.allowed).toBe(false);
  });
});
