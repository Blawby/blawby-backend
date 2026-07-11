import { describe, expect, it } from 'vitest';
import {
  getStaffRoles,
  isStaffRole,
  isVerifiedStaffUser,
  parseGlobalRoles,
  STAFF_ROLES,
  staffAccessRoles,
} from '@/shared/auth/permissions';

describe('staffAccessRoles', () => {
  it('gives support read-only console and user lookup, nothing destructive', () => {
    expect(staffAccessRoles.support.authorize({ internalConsole: ['read'] }).success).toBe(true);
    expect(staffAccessRoles.support.authorize({ user: ['list'] }).success).toBe(true);
    expect(staffAccessRoles.support.authorize({ user: ['ban'] }).success).toBe(false);
    expect(staffAccessRoles.support.authorize({ user: ['set-role'] }).success).toBe(false);
  });

  it('gives ops ban and session-revoke powers but not set-role', () => {
    expect(staffAccessRoles.ops.authorize({ user: ['ban'] }).success).toBe(true);
    expect(staffAccessRoles.ops.authorize({ session: ['revoke'] }).success).toBe(true);
    expect(staffAccessRoles.ops.authorize({ user: ['set-role'] }).success).toBe(false);
  });

  it('gives super_admin full admin statements plus impersonate-admins and console manage', () => {
    expect(staffAccessRoles.super_admin.authorize({ user: ['set-role'] }).success).toBe(true);
    expect(staffAccessRoles.super_admin.authorize({ user: ['impersonate-admins'] }).success).toBe(true);
    expect(staffAccessRoles.super_admin.authorize({ internalConsole: ['manage'] }).success).toBe(true);
  });

  it('does not give plain admin any console access', () => {
    expect(staffAccessRoles.admin.authorize({ internalConsole: ['read'] }).success).toBe(false);
  });
});

describe('parseGlobalRoles / getStaffRoles', () => {
  it('splits comma-separated roles and trims whitespace', () => {
    expect(parseGlobalRoles('user, support')).toEqual(['user', 'support']);
    expect(parseGlobalRoles('user,support,super_admin')).toEqual(['user', 'support', 'super_admin']);
    expect(parseGlobalRoles(null)).toEqual([]);
    expect(parseGlobalRoles(undefined)).toEqual([]);
    expect(parseGlobalRoles('')).toEqual([]);
  });

  it('filters to staff roles only', () => {
    expect(getStaffRoles('support')).toEqual(['support']);
    expect(getStaffRoles('user,support')).toEqual(['support']);
    expect(getStaffRoles('user,ops,super_admin')).toEqual(['ops', 'super_admin']);
    expect(getStaffRoles('user,admin')).toEqual([]);
    expect(getStaffRoles(null)).toEqual([]);
  });

  it('STAFF_ROLES contains exactly the three staff tiers', () => {
    expect([...STAFF_ROLES]).toEqual(['support', 'ops', 'super_admin']);
  });

  it('identifies staff-role strings', () => {
    expect(isStaffRole('support')).toBe(true);
    expect(isStaffRole('owner')).toBe(false);
  });
});

describe('isVerifiedStaffUser', () => {
  it('accepts verified user on the staff domain, case-insensitive', () => {
    expect(isVerifiedStaffUser({ email: 'sam@blawby.com', emailVerified: true }, 'blawby.com')).toBe(true);
    expect(isVerifiedStaffUser({ email: 'Sam@Blawby.COM', emailVerified: true }, 'blawby.com')).toBe(true);
  });

  it('rejects wrong domain, unverified email, and missing user', () => {
    expect(isVerifiedStaffUser({ email: 'sam@gmail.com', emailVerified: true }, 'blawby.com')).toBe(false);
    expect(isVerifiedStaffUser({ email: 'sam@blawby.com', emailVerified: false }, 'blawby.com')).toBe(false);
    expect(isVerifiedStaffUser(null, 'blawby.com')).toBe(false);
    expect(isVerifiedStaffUser({ email: null, emailVerified: true }, 'blawby.com')).toBe(false);
  });

  it('rejects lookalike domains', () => {
    expect(isVerifiedStaffUser({ email: 'sam@notblawby.com', emailVerified: true }, 'blawby.com')).toBe(false);
  });
});
