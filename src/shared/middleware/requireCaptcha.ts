import type { MiddlewareHandler } from 'hono';
import { validateCaptchaToken } from '@/shared/utils/captchaValidation';
import { response } from '@/shared/utils/responseUtils';

/**
 * Middleware to require a valid Captcha token
 *
 * Looks for the token in:
 * 1. 'x-captcha-token' header
 * 2. 'cf-turnstile-response' body field (if multipart/form-data or json) - *Not implemented for body parsing simplicity in middleware, relying on header usually*
 *
 * For simplicity and performance in middleware, we primarily check the header `x-captcha-token`.
 * Clients should send the token in this header.
 */
export const requireCaptcha = (): MiddlewareHandler => {
  return async (c, next) => {
    // Skip if in development and configured to skip (optional, but good for DX)
    if (process.env.SKIP_CAPTCHA === 'true') {
      return next();
    }

    const token = c.req.header('x-captcha-token') || c.req.header('x-turnstile-token');
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for');

    if (!token) {
      return response.forbidden(c, 'Captcha token is missing');
    }

    const isValid = await validateCaptchaToken(token, ip);

    if (!isValid) {
      return response.forbidden(c, 'Captcha validation failed');
    }

    await next();
  };
};
