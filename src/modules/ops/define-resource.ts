import type { DefineOpsResourceConfig, OpsListParams, OpsResource } from '@/modules/ops/types';
import { db } from '@/shared/database';
import { and, asc, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';

const serializeRow = (row: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])
  );

// Escape LIKE wildcards so a search for "100%" matches literally instead of as a pattern.
const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

export const toSearchPattern = (q: string): string => `%${escapeLikePattern(q.trim())}%`;

export const defineOpsResource = (config: DefineOpsResourceConfig): OpsResource => {
  const { name, table, idColumn, select, searchable = [], sortable = {}, defaultSort, filters, baseFilter } = config;

  if (defaultSort && !sortable[defaultSort.key]) {
    throw new Error(`Ops resource "${name}": defaultSort key "${defaultSort.key}" is not in sortable`);
  }

  const buildWhere = (params: OpsListParams): SQL | undefined => {
    const conditions: (SQL | undefined)[] = [baseFilter];

    if (params.q && searchable.length > 0) {
      const pattern = toSearchPattern(params.q);
      conditions.push(or(...searchable.map((column) => ilike(column, pattern))));
    }

    if (params.status && filters?.status) {
      conditions.push(eq(filters.status, params.status));
    }

    return and(...conditions);
  };

  // idColumn tie-breaker keeps offset pagination stable when sort values collide.
  const resolveOrderBy = (params: OpsListParams): SQL[] => {
    const requested = params.sort ? sortable[params.sort] : undefined;

    if (requested) {
      const direction = params.order === 'asc' ? asc : desc;
      return [direction(requested), asc(idColumn)];
    }

    if (defaultSort) {
      const column = sortable[defaultSort.key];
      const direction = defaultSort.order === 'asc' ? asc : desc;
      return [direction(column), asc(idColumn)];
    }

    return [asc(idColumn)];
  };

  const list: OpsResource['list'] = async (params) => {
    const where = buildWhere(params);
    const orderBy = resolveOrderBy(params);

    let rowsQuery = db.select(select).from(table).$dynamic();
    let totalQuery = db.select({ total: count() }).from(table).$dynamic();

    if (where) {
      rowsQuery = rowsQuery.where(where);
      totalQuery = totalQuery.where(where);
    }

    rowsQuery = rowsQuery.orderBy(...orderBy);

    const [rows, totalRows] = await Promise.all([rowsQuery.limit(params.limit).offset(params.offset), totalQuery]);

    return {
      data: rows.map(serializeRow),
      total: totalRows.at(0)?.total ?? 0,
    };
  };

  const get: OpsResource['get'] = async (id) => {
    const [row] = await db
      .select(select)
      .from(table)
      .where(and(eq(idColumn, id), baseFilter))
      .limit(1);

    return row ? serializeRow(row) : null;
  };

  return {
    name,
    list,
    get,
    ...(config.relations ? { relations: config.relations } : {}),
  };
};
