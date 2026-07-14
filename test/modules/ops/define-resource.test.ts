import { describe, expect, it, vi, beforeEach } from 'vitest';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { isNull } from 'drizzle-orm';
import { db } from '@/shared/database';
import { defineOpsResource, toSearchPattern } from '@/modules/ops/define-resource';
import type { OpsListParams } from '@/modules/ops/types';

vi.mock('@/shared/database', () => ({
  db: {
    select: vi.fn(),
  },
}));

const selectMock = vi.mocked(db.select);

const testTable = pgTable('ops_test_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name'),
  status: text('status', { enum: ['active', 'archived'] }).notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull(),
});

interface QueryChain {
  from: ReturnType<typeof vi.fn>;
  $dynamic: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
  then: (resolve: (rows: unknown[]) => void) => void;
}

const makeQueryChain = (rows: unknown[]): QueryChain => {
  const chain: Partial<QueryChain> = {};
  chain.from = vi.fn(() => chain);
  chain.$dynamic = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.offset = vi.fn(() => chain);
  chain.then = (resolve) => resolve(rows);
  return chain as QueryChain;
};

const listParams = (overrides: Partial<OpsListParams> = {}): OpsListParams => ({
  limit: 25,
  offset: 0,
  q: null,
  status: null,
  sort: null,
  order: null,
  ...overrides,
});

const baseConfig = {
  name: 'items',
  table: testTable,
  idColumn: testTable.id,
  select: {
    id: testTable.id,
    email: testTable.email,
    name: testTable.name,
    status: testTable.status,
    created_at: testTable.createdAt,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('toSearchPattern', () => {
  it('wraps the query in wildcards and escapes LIKE special characters', () => {
    expect(toSearchPattern('smith')).toBe('%smith%');
    expect(toSearchPattern('  smith  ')).toBe('%smith%');
    expect(toSearchPattern('100%')).toBe('%100\\%%');
    expect(toSearchPattern('a_b')).toBe('%a\\_b%');
    expect(toSearchPattern('back\\slash')).toBe('%back\\\\slash%');
  });
});

describe('defineOpsResource', () => {
  it('throws at definition time when defaultSort key is not in sortable', () => {
    expect(() =>
      defineOpsResource({
        ...baseConfig,
        sortable: { created_at: testTable.createdAt },
        defaultSort: { key: 'updated_at', order: 'desc' },
      })
    ).toThrow('defaultSort key "updated_at" is not in sortable');
  });

  describe('list', () => {
    it('returns serialized rows and total, converting Date fields to ISO strings', async () => {
      const createdAt = new Date('2026-01-15T10:30:00.000Z');
      const rowsChain = makeQueryChain([
        { id: 'u1', email: 'a@b.com', name: 'A', status: 'active', created_at: createdAt },
      ]);
      const totalChain = makeQueryChain([{ total: 42 }]);
      selectMock.mockReturnValueOnce(rowsChain as never).mockReturnValueOnce(totalChain as never);

      const resource = defineOpsResource(baseConfig);
      const result = await resource.list(listParams());

      expect(result).toEqual({
        data: [{ id: 'u1', email: 'a@b.com', name: 'A', status: 'active', created_at: '2026-01-15T10:30:00.000Z' }],
        total: 42,
      });
      expect(rowsChain.limit).toHaveBeenCalledWith(25);
      expect(rowsChain.offset).toHaveBeenCalledWith(0);
    });

    it('applies no where clause without q, status filter, or baseFilter', async () => {
      const rowsChain = makeQueryChain([]);
      const totalChain = makeQueryChain([{ total: 0 }]);
      selectMock.mockReturnValueOnce(rowsChain as never).mockReturnValueOnce(totalChain as never);

      const resource = defineOpsResource({ ...baseConfig, searchable: [testTable.email] });
      await resource.list(listParams());

      expect(rowsChain.where).not.toHaveBeenCalled();
      expect(totalChain.where).not.toHaveBeenCalled();
    });

    it('applies where clause to both rows and total when searching', async () => {
      const rowsChain = makeQueryChain([]);
      const totalChain = makeQueryChain([{ total: 0 }]);
      selectMock.mockReturnValueOnce(rowsChain as never).mockReturnValueOnce(totalChain as never);

      const resource = defineOpsResource({ ...baseConfig, searchable: [testTable.email, testTable.name] });
      await resource.list(listParams({ q: 'smith' }));

      expect(rowsChain.where).toHaveBeenCalledTimes(1);
      expect(totalChain.where).toHaveBeenCalledTimes(1);
    });

    it('ignores q when no searchable columns are configured', async () => {
      const rowsChain = makeQueryChain([]);
      const totalChain = makeQueryChain([{ total: 0 }]);
      selectMock.mockReturnValueOnce(rowsChain as never).mockReturnValueOnce(totalChain as never);

      const resource = defineOpsResource(baseConfig);
      await resource.list(listParams({ q: 'smith' }));

      expect(rowsChain.where).not.toHaveBeenCalled();
    });

    it('applies status filter only when configured', async () => {
      const withFilter = makeQueryChain([]);
      const withFilterTotal = makeQueryChain([{ total: 0 }]);
      selectMock.mockReturnValueOnce(withFilter as never).mockReturnValueOnce(withFilterTotal as never);

      const filtered = defineOpsResource({ ...baseConfig, filters: { status: testTable.status } });
      await filtered.list(listParams({ status: 'active' }));
      expect(withFilter.where).toHaveBeenCalledTimes(1);

      const withoutFilter = makeQueryChain([]);
      const withoutFilterTotal = makeQueryChain([{ total: 0 }]);
      selectMock.mockReturnValueOnce(withoutFilter as never).mockReturnValueOnce(withoutFilterTotal as never);

      const unfiltered = defineOpsResource(baseConfig);
      await unfiltered.list(listParams({ status: 'active' }));
      expect(withoutFilter.where).not.toHaveBeenCalled();
    });

    it('always applies baseFilter', async () => {
      const rowsChain = makeQueryChain([]);
      const totalChain = makeQueryChain([{ total: 0 }]);
      selectMock.mockReturnValueOnce(rowsChain as never).mockReturnValueOnce(totalChain as never);

      const resource = defineOpsResource({ ...baseConfig, baseFilter: isNull(testTable.deletedAt) });
      await resource.list(listParams());

      expect(rowsChain.where).toHaveBeenCalledTimes(1);
      expect(totalChain.where).toHaveBeenCalledTimes(1);
    });

    it('orders by requested sortable column, falling back to defaultSort, else id only — always with id tie-breaker', async () => {
      const sortable = {
        sortable: { created_at: testTable.createdAt, email: testTable.email },
        defaultSort: { key: 'created_at', order: 'desc' as const },
      };

      const requestedChain = makeQueryChain([]);
      selectMock.mockReturnValueOnce(requestedChain as never).mockReturnValueOnce(makeQueryChain([]) as never);
      await defineOpsResource({ ...baseConfig, ...sortable }).list(listParams({ sort: 'email', order: 'asc' }));
      expect(requestedChain.orderBy).toHaveBeenCalledTimes(1);
      expect(requestedChain.orderBy.mock.calls[0]).toHaveLength(2);

      const fallbackChain = makeQueryChain([]);
      selectMock.mockReturnValueOnce(fallbackChain as never).mockReturnValueOnce(makeQueryChain([]) as never);
      await defineOpsResource({ ...baseConfig, ...sortable }).list(listParams({ sort: 'not_sortable' }));
      expect(fallbackChain.orderBy).toHaveBeenCalledTimes(1);
      expect(fallbackChain.orderBy.mock.calls[0]).toHaveLength(2);

      const unsortedChain = makeQueryChain([]);
      selectMock.mockReturnValueOnce(unsortedChain as never).mockReturnValueOnce(makeQueryChain([]) as never);
      await defineOpsResource(baseConfig).list(listParams({ sort: 'email' }));
      expect(unsortedChain.orderBy).toHaveBeenCalledTimes(1);
      expect(unsortedChain.orderBy.mock.calls[0]).toHaveLength(1);
    });
  });

  describe('get', () => {
    it('returns serialized row by id', async () => {
      const createdAt = new Date('2026-02-01T00:00:00.000Z');
      const chain = makeQueryChain([
        { id: 'u1', email: 'a@b.com', name: null, status: 'active', created_at: createdAt },
      ]);
      selectMock.mockReturnValueOnce(chain as never);

      const resource = defineOpsResource(baseConfig);
      const result = await resource.get('u1');

      expect(result).toEqual({
        id: 'u1',
        email: 'a@b.com',
        name: null,
        status: 'active',
        created_at: '2026-02-01T00:00:00.000Z',
      });
      expect(chain.where).toHaveBeenCalledTimes(1);
      expect(chain.limit).toHaveBeenCalledWith(1);
    });

    it('returns null when no row matches', async () => {
      selectMock.mockReturnValueOnce(makeQueryChain([]) as never);

      const resource = defineOpsResource(baseConfig);
      await expect(resource.get('missing')).resolves.toBeNull();
    });
  });
});
