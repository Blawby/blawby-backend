import { db } from '@/shared/database';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { makeHonoContext } from '@/test/helpers/hono-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppAbility } from '@/shared/auth/abilities.types';

vi.mock('@/shared/database', () => ({
  db: {
    select: vi.fn(),
  },
}));

const selectMock = vi.mocked(db.select);

const makeQueryChain = (rows: { role: string }[]) => ({
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue(rows),
});

interface ContextState extends Record<string, unknown> {
  userId: string | null;
  activeOrganizationId: string | null;
  memberRole?: string | null;
  ability?: unknown;
  user?: { role?: string | null; email?: string; emailVerified?: boolean } | null;
}

const next = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('injectAbility', () => {
  it('sets an empty ability and continues when userId is missing', async () => {
    const { c, values } = makeHonoContext<ContextState>({ userId: null, activeOrganizationId: null });

    await injectAbility()(c, next);

    expect(values.ability).toBeDefined();
    expect(selectMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('looks up member role and injects a scoped ability when orgId is present', async () => {
    const chain = makeQueryChain([{ role: 'owner' }]);
    selectMock.mockReturnValue(chain as never);
    const { c, values } = makeHonoContext<ContextState>({ userId: 'user_1', activeOrganizationId: 'org_1' });

    await injectAbility()(c, next);

    expect(selectMock).toHaveBeenCalledOnce();
    expect(values.memberRole).toBe('owner');
    expect(values.ability).toBeDefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('sets memberRole to null when no membership row is found', async () => {
    const chain = makeQueryChain([]);
    selectMock.mockReturnValue(chain as never);
    const { c, values } = makeHonoContext<ContextState>({ userId: 'user_1', activeOrganizationId: 'org_1' });

    await injectAbility()(c, next);

    expect(values.memberRole).toBeNull();
    expect(next).toHaveBeenCalledOnce();
  });

  it('skips the member lookup when there is no active organization', async () => {
    const { c, values } = makeHonoContext<ContextState>({ userId: 'user_1', activeOrganizationId: null });

    await injectAbility()(c, next);

    expect(selectMock).not.toHaveBeenCalled();
    expect(values.memberRole).toBeNull();
    expect(next).toHaveBeenCalledOnce();
  });

  it('falls back to an empty ability and still calls next when the lookup throws', async () => {
    selectMock.mockImplementation(() => {
      throw new Error('db down');
    });
    const { c, values } = makeHonoContext<ContextState>({ userId: 'user_1', activeOrganizationId: 'org_1' });

    await injectAbility()(c, next);

    expect(values.ability).toBeDefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('grants console ability for a verified staff-domain user with a staff role', async () => {
    const { c, values } = makeHonoContext<ContextState>({
      userId: 'user_1',
      activeOrganizationId: null,
      user: { role: 'user,support', email: 'sam@blawby.com', emailVerified: true },
    });

    await injectAbility()(c, next);

    const ability = values.ability as AppAbility;
    expect(ability.can('read', 'InternalConsole')).toBe(true);
    expect(ability.can('manage', 'InternalConsole')).toBe(false);
  });

  it('keeps staff roles inert for a non-staff-domain email', async () => {
    const { c, values } = makeHonoContext<ContextState>({
      userId: 'user_1',
      activeOrganizationId: null,
      user: { role: 'user,super_admin', email: 'owner@lawfirm.com', emailVerified: true },
    });

    await injectAbility()(c, next);

    const ability = values.ability as AppAbility;
    expect(ability.can('read', 'InternalConsole')).toBe(false);
  });

  it('keeps staff roles inert for an unverified staff-domain email', async () => {
    const { c, values } = makeHonoContext<ContextState>({
      userId: 'user_1',
      activeOrganizationId: null,
      user: { role: 'user,super_admin', email: 'sam@blawby.com', emailVerified: false },
    });

    await injectAbility()(c, next);

    const ability = values.ability as AppAbility;
    expect(ability.can('read', 'InternalConsole')).toBe(false);
  });
});
