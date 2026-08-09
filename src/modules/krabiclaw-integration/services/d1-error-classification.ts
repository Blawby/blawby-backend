import Cloudflare from 'cloudflare';

export const isRetryableD1Error = (error: unknown): boolean =>
  error instanceof Cloudflare.RateLimitError ||
  error instanceof Cloudflare.InternalServerError ||
  error instanceof Cloudflare.APIConnectionTimeoutError ||
  error instanceof Cloudflare.APIConnectionError;
