import { and, asc, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { db } from '@/shared/database';
import type { OpsListParams, OpsResource } from '@/modules/ops/types';

export interface DefineOpsResourceConfig {
  name: string;
  table: PgTable;
  idColumn: PgColumn;
  select: Record<string, PgColumn>;
  searchable?: PgColumn[];
  sortable?: Record<string, PgColumn>;
  defaultSort?: { key: string; order: 'asc' | 'desc' };
  filters?: { status?: PgColumn };
  /** Always applied to list and get queries, e.g. to exclude soft-deleted rows. */
  baseFilter?: SQL;
  relations?: OpsResource['relations'];
}

const serializeRow = (row: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])
  );

export const defineOpsResource = (config: DefineOpsResourceConfig): OpsResource => {
  const { name, table, idColumn, select, searchable = [], sortable = {}, defaultSort, filters, baseFilter } = config;

  if (defaultSort && !sortable[defaultSort.key]) {
    throw new Error(`Ops resource "${name}": defaultSort key "${defaultSort.key}" is not in sortable`);
  }

  const buildWhere = (params: OpsListParams): SQL | undefined => {
    const conditions: (SQL | undefined)[] = [baseFilter];

    if (params.q && searchable.length > 0) {
      const pattern = `%${params.q.trim()}%`;
      conditions.push(or(...searchable.map((column) => ilike(column, pattern))));
    }

    if (params.status && filters?.status) {
      conditions.push(eq(filters.status, params.status));
    }

    return and(...conditions);
  };

  const resolveOrderBy = (params: OpsListParams): SQL | undefined => {
    const requested = params.sort ? sortable[params.sort] : undefined;

    if (requested) {
      return params.order === 'asc' ? asc(requested) : desc(requested);
    }

    if (defaultSort) {
      const column = sortable[defaultSort.key];
      return defaultSort.order === 'asc' ? asc(column) : desc(column);
    }

    return undefined;
  };

  const list: OpsResource['list'] = async (params) => {
    const where = buildWhere(params);
    const orderBy = resolveOrderBy(params);

    const rowsQuery = db.select(select).from(table).$dynamic();
    const totalQuery = db.select({ total: count() }).from(table).$dynamic();

    if (where) {
      rowsQuery.where(where);
      totalQuery.where(where);
    }

    if (orderBy) {
      rowsQuery.orderBy(orderBy);
    }

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
