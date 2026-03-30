import type { MiddlewareHandler } from 'hono';
import { config } from '@/shared/config';
import { validateCaptchaToken as defaultValidate } from '@/shared/utils/captchaValidation';

/**
 * Middleware to require a valid Captcha token
 *
 * Looks for the token in:
 * 1. 'x-captcha-token' header
 * 2. 'cf-turnstile-response' body field (if multipart/form-data or json)
 *  - *Not implemented for body parsing simplicity in middleware, relying on header usually*
 *
 * For simplicity and performance in middleware, we primarily check the header `x-captcha-token`.
 * Clients should send the token in this header.
 */
export const requireCaptcha =
  (validate = defaultValidate): MiddlewareHandler =>
  async (c, next) => {
    if (config.captcha.skip) {
      return next();
    }

    const token = c.req.header('x-captcha-token') ?? c.req.header('x-turnstile-token');
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for');

    if (!token) {
      return c.json({ error: 'Forbidden', message: 'Captcha token is missing', request_id: c.get('requestId') }, 403);
    }

    const isValid = await validate(token, ip);

    if (!isValid) {
      return c.json({ error: 'Forbidden', message: 'Captcha validation failed', request_id: c.get('requestId') }, 403);
    }

    await next();
  };
