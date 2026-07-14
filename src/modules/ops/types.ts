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
