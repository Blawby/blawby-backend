// Common API types - use type not interface

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  validation?: Array<{
    field: string;
    message: string;
    code: string;
  }>;
}

export type SortOrder = 'asc' | 'desc';

export interface SortParams<T extends string> {
  sortBy?: T;
  sortOrder?: SortOrder;
}

export interface SearchParams {
  search?: string;
  q?: string;
}

export interface DateRange {
  startDate?: string;
  endDate?: string;
}

export interface IdParam {
  id: string;
}

export interface BulkAction<T> {
  ids: string[];
  action: T;
}

export interface FileUpload {
  filename: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
