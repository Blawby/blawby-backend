import type { Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { freshUser } from '@/modules/ops/fresh-user';
import { db } from '@/shared/database';

vi.mock('@/shared/database', () => ({
  db: {
    select: vi.fn(),
  },
}));

const selectMock = vi.mocked(db.select);

const makeQueryChain = (rows: unknown[]) => ({
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue(rows),
});

const makeContext = (state: Record<string, unknown>) => {
  const values: Record<string, unknown> = { ...state };
  const c = {
    get: vi.fn((key: string) => values[key]),
    set: vi.fn((key: string, value: unknown) => {
      values[key] = value;
    }),
  } as unknown as Context;

  return { c, values };
};

const next = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('freshUser', () => {
  it('replaces the session user with the fresh DB row', async () => {
    const staleUser = { id: 'user_1', role: 'user,super_admin', email: 'sam@blawby.com', emailVerified: true };
    const freshRow = { id: 'user_1', role: 'user', email: 'sam@blawby.com', emailVerified: true };
    selectMock.mockReturnValue(makeQueryChain([freshRow]) as never);
    const { c, values } = makeContext({ userId: 'user_1', user: staleUser });

    await freshUser()(c, next);

    expect(values.user).toEqual(freshRow);
    expect(next).toHaveBeenCalledOnce();
  });

  it('leaves context untouched when there is no userId', async () => {
    const { c } = makeContext({ userId: null, user: null });

    await freshUser()(c, next);

    expect(selectMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('keeps the session user when the DB row is missing', async () => {
    const staleUser = { id: 'user_1', role: 'user' };
    selectMock.mockReturnValue(makeQueryChain([]) as never);
    const { c, values } = makeContext({ userId: 'user_1', user: staleUser });

    await freshUser()(c, next);

    expect(values.user).toEqual(staleUser);
    expect(next).toHaveBeenCalledOnce();
  });
});
