export type AppError = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
};

export type Result<T> = { success: true; data: T } | { success: false; error: AppError };

/**
 * Generic type for paginated data (items + total only)
 */
export type PaginatedData<T, K extends string = 'items'> = {
  [P in K]: T[];
} & {
  total: number;
};

/**
 * Paginated data including page metadata (page, limit, total_pages)
 */
export type PaginatedDataWithMeta<T, K extends string = 'items'> = PaginatedData<T, K> & {
  page: number;
  limit: number;
  total_pages: number;
};

/**
 * Generic type for paginated result
 */
export type PaginatedResult<T, K extends string = 'items'> = Result<PaginatedData<T, K>>;

/**
 * Paginated result including page metadata
 */
export type PaginatedResultWithMeta<T, K extends string = 'items'> = Result<PaginatedDataWithMeta<T, K>>;
