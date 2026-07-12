import { describe, expect, it } from 'vitest';
import { defineAbilityFor } from '@/shared/auth/abilities';

describe('defineAbilityFor — staff grants', () => {
  it('grants support console read only', () => {
    const ability = defineAbilityFor(null, { userId: 'u1', globalRole: 'user,support', isVerifiedStaff: true });

    expect(ability.can('read', 'InternalConsole')).toBe(true);
    expect(ability.can('manage', 'InternalConsole')).toBe(false);
  });

  it('grants ops console read only', () => {
    const ability = defineAbilityFor(null, { userId: 'u1', globalRole: 'user,ops', isVerifiedStaff: true });

    expect(ability.can('read', 'InternalConsole')).toBe(true);
    expect(ability.can('manage', 'InternalConsole')).toBe(false);
  });

  it('grants super_admin console manage', () => {
    const ability = defineAbilityFor(null, { userId: 'u1', globalRole: 'user,super_admin', isVerifiedStaff: true });

    expect(ability.can('manage', 'InternalConsole')).toBe(true);
  });

  it('supports existing single-role super_admin values during rollout', () => {
    const ability = defineAbilityFor(null, { userId: 'u1', globalRole: 'super_admin', isVerifiedStaff: true });

    expect(ability.can('manage', 'InternalConsole')).toBe(true);
  });

  it('treats staff roles as inert without verified staff email', () => {
    const ability = defineAbilityFor(null, { userId: 'u1', globalRole: 'user,super_admin', isVerifiedStaff: false });

    expect(ability.can('read', 'InternalConsole')).toBe(false);
  });

  it('treats staff roles as inert when isVerifiedStaff is omitted', () => {
    const ability = defineAbilityFor(null, { userId: 'u1', globalRole: 'super_admin' });

    expect(ability.can('read', 'InternalConsole')).toBe(false);
  });

  it('does not leak tenant-scoped subjects to staff without an org role', () => {
    const ability = defineAbilityFor(null, { userId: 'u1', globalRole: 'user,super_admin', isVerifiedStaff: true });

    expect(ability.can('read', 'Matter')).toBe(false);
    expect(ability.can('manage', 'Organization')).toBe(false);
  });

  it('unions grants for multi-staff-role users', () => {
    const ability = defineAbilityFor(null, { userId: 'u1', globalRole: 'user,support,ops', isVerifiedStaff: true });

    expect(ability.can('read', 'InternalConsole')).toBe(true);
    expect(ability.can('manage', 'InternalConsole')).toBe(false);
  });

  it('contains tenant org admins away from the internal console', () => {
    const ability = defineAbilityFor('owner', { userId: 'u1', organizationId: 'org1' });

    expect(ability.can('manage', 'Matter')).toBe(true);
    expect(ability.can('read', 'InternalConsole')).toBe(false);
    expect(ability.can('manage', 'InternalConsole')).toBe(false);
  });

  it('contains tenant members away from the internal console', () => {
    const ability = defineAbilityFor('member', { userId: 'u1', organizationId: 'org1' });

    expect(ability.can('read', 'Matter')).toBe(true);
    expect(ability.can('read', 'InternalConsole')).toBe(false);
  });

  it('lets verified staff keep console access even when an active org role is present', () => {
    const ability = defineAbilityFor('owner', {
      userId: 'u1',
      organizationId: 'org1',
      globalRole: 'user,support',
      isVerifiedStaff: true,
    });

    expect(ability.can('read', 'InternalConsole')).toBe(true);
    expect(ability.can('manage', 'InternalConsole')).toBe(false);
  });
});
