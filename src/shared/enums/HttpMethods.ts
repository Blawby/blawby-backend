/**
 * HTTP Methods Enum
 *
 * Standard HTTP methods used for route file naming and registration.
 * Values are uppercase to match HTTP standard conventions.
 */
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  OPTIONS = 'OPTIONS',
  HEAD = 'HEAD'
}

/**
 * Array of all HTTP methods for iteration and validation
 */
export const HTTP_METHODS = Object.values(HttpMethod);
