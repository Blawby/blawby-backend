export type AppError = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
};

export type Result<T>
  = { success: true; data: T }
  | { success: false; error: AppError };

/**
 * Generic type for paginated data
 */
export type PaginatedData<T, K extends string = 'items'> = {
  [P in K]: T[];
} & {
  total: number;
};

/**
 * Generic type for paginated result
 */
export type PaginatedResult<T, K extends string = 'items'> = Result<PaginatedData<T, K>>;
