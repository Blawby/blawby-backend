import { APIConnectionError, APIConnectionTimeoutError, InternalServerError, RateLimitError } from 'cloudflare';

export const isRetryableD1Error = (error: unknown): boolean =>
  error instanceof RateLimitError ||
  error instanceof InternalServerError ||
  error instanceof APIConnectionTimeoutError ||
  error instanceof APIConnectionError;
