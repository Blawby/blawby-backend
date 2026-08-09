import { isRetryableD1Error } from '@/modules/krabiclaw-integration/services/d1-error-classification';
import Cloudflare from 'cloudflare';
import { describe, expect, it } from 'vitest';

describe('isRetryableD1Error', () => {
  it('treats a 429 as retryable', () => {
    const error = new Cloudflare.RateLimitError(429, {}, 'rate limited', new Headers());
    expect(isRetryableD1Error(error)).toBe(true);
  });

  it('treats a 5xx as retryable', () => {
    const error = new Cloudflare.InternalServerError(500, {}, 'server error', new Headers());
    expect(isRetryableD1Error(error)).toBe(true);
  });

  it('treats a connection timeout as retryable', () => {
    expect(isRetryableD1Error(new Cloudflare.APIConnectionTimeoutError())).toBe(true);
  });

  it('treats a connection error as retryable', () => {
    expect(isRetryableD1Error(new Cloudflare.APIConnectionError({}))).toBe(true);
  });

  it('does not retry a 400 (malformed request)', () => {
    const error = new Cloudflare.BadRequestError(400, {}, 'bad request', new Headers());
    expect(isRetryableD1Error(error)).toBe(false);
  });

  it('does not retry a 401 (unauthorized)', () => {
    const error = new Cloudflare.AuthenticationError(401, {}, 'unauthorized', new Headers());
    expect(isRetryableD1Error(error)).toBe(false);
  });

  it('does not retry a 403 (forbidden)', () => {
    const error = new Cloudflare.PermissionDeniedError(403, {}, 'forbidden', new Headers());
    expect(isRetryableD1Error(error)).toBe(false);
  });

  it('does not retry a 404 (not found)', () => {
    const error = new Cloudflare.NotFoundError(404, {}, 'not found', new Headers());
    expect(isRetryableD1Error(error)).toBe(false);
  });

  it('does not retry an arbitrary non-Cloudflare error', () => {
    expect(isRetryableD1Error(new Error('boom'))).toBe(false);
  });
});
