// Common API types - use type not interface

export type PaginationParams = {
  page?: number;
  limit?: number;
  offset?: number;
};

export type PaginatedResponse<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};

export type ApiResponse<T> = {
  data: T;
  message?: string;
};

export type ApiError = {
  statusCode: number;
  error: string;
  message: string;
  validation?: Array<{
    field: string;
    message: string;
    code: string;
  }>;
};

export type SortOrder = 'asc' | 'desc';

export type SortParams<T extends string> = {
  sortBy?: T;
  sortOrder?: SortOrder;
};

export type SearchParams = {
  search?: string;
  q?: string;
};

export type DateRange = {
  startDate?: string;
  endDate?: string;
};

export type IdParam = {
  id: string;
};

export type BulkAction<T> = {
  ids: string[];
  action: T;
};

export type FileUpload = {
  filename: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};
