import { type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

export interface OpsListParams {
  limit: number;
  offset: number;
  q: string | null;
  status: string | null;
  sort: string | null;
  order: 'asc' | 'desc' | null;
}

export interface OpsListResult {
  data: unknown[];
  total: number;
}

export interface OpsRelation {
  list: (parentId: string, params: OpsListParams) => Promise<OpsListResult>;
}

export interface OpsResource {
  name: string;
  list: (params: OpsListParams) => Promise<OpsListResult>;
  get: (id: string) => Promise<unknown | null>;
  relations?: Record<string, OpsRelation>;
}

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
