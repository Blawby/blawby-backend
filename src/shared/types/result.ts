export type AppError = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
};

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: AppError };
