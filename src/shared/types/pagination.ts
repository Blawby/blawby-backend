export interface CursorPageInfo {
  has_next_page: boolean;
  has_previous_page: boolean;
  next_cursor: string | null;
  previous_cursor: string | null;
}

export interface OffsetPaginationMeta {
  page: number;
  limit: number;
  total: number;
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  page_info: CursorPageInfo;
  pagination?: never;
}

export interface OffsetPaginatedResponse<T> {
  data: T[];
  page_info?: never;
  pagination: OffsetPaginationMeta;
}

export type PaginatedResponse<T> = CursorPaginatedResponse<T> | OffsetPaginatedResponse<T>;
