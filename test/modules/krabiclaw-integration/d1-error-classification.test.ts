import { isRetryableD1Error } from '@/modules/krabiclaw-integration/services/d1-error-classification';
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from 'cloudflare';
import { describe, expect, it } from 'vitest';

describe('isRetryableD1Error', () => {
  it('treats a 429 as retryable', () => {
    const error = new RateLimitError(429, {}, 'rate limited', new Headers());
    expect(isRetryableD1Error(error)).toBe(true);
  });

  it('treats a 5xx as retryable', () => {
    const error = new InternalServerError(500, {}, 'server error', new Headers());
    expect(isRetryableD1Error(error)).toBe(true);
  });

  it('treats a connection timeout as retryable', () => {
    expect(isRetryableD1Error(new APIConnectionTimeoutError())).toBe(true);
  });

  it('treats a connection error as retryable', () => {
    expect(isRetryableD1Error(new APIConnectionError({}))).toBe(true);
  });

  it('does not retry a 400 (malformed request)', () => {
    const error = new BadRequestError(400, {}, 'bad request', new Headers());
    expect(isRetryableD1Error(error)).toBe(false);
  });

  it('does not retry a 401 (unauthorized)', () => {
    const error = new AuthenticationError(401, {}, 'unauthorized', new Headers());
    expect(isRetryableD1Error(error)).toBe(false);
  });

  it('does not retry a 403 (forbidden)', () => {
    const error = new PermissionDeniedError(403, {}, 'forbidden', new Headers());
    expect(isRetryableD1Error(error)).toBe(false);
  });

  it('does not retry a 404 (not found)', () => {
    const error = new NotFoundError(404, {}, 'not found', new Headers());
    expect(isRetryableD1Error(error)).toBe(false);
  });

  it('does not retry an arbitrary non-Cloudflare error', () => {
    expect(isRetryableD1Error(new Error('boom'))).toBe(false);
  });
});
