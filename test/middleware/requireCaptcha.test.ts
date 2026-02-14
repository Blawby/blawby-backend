import { describe, it, expect, vi, afterEach } from 'vitest';
import { Hono } from 'hono';
import { requireCaptcha } from '@/shared/middleware/requireCaptcha';
import * as validationUtils from '@/shared/utils/captchaValidation';

describe('requireCaptcha middleware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return 403 if token is missing', async () => {
    const app = new Hono();
    app.use('/protected', requireCaptcha());
    app.get('/protected', (c) => c.text('ok'));

    const res = await app.request('http://localhost/protected');
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string; message: string };
    expect(body.error).toBe('Forbidden');
    expect(body.message).toBe('Captcha token is missing');
  });

  it('should return 403 if validation fails', async () => {
    // Mock failure
    vi.spyOn(validationUtils, 'validateCaptchaToken').mockResolvedValue(false);

    const app = new Hono();
    app.use('/protected', requireCaptcha());
    app.get('/protected', (c) => c.text('ok'));

    const res = await app.request('http://localhost/protected', {
      headers: {
        'x-captcha-token': 'invalid-token',
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json() as { error: string; message: string };
    expect(body.error).toBe('Forbidden');
    expect(body.message).toBe('Captcha validation failed');
  });

  it('should pass if validation succeeds', async () => {
    // Mock success
    vi.spyOn(validationUtils, 'validateCaptchaToken').mockResolvedValue(true);

    const app = new Hono();
    app.use('/protected', requireCaptcha());
    app.get('/protected', (c) => c.text('ok'));

    const res = await app.request('http://localhost/protected', {
      headers: {
        'x-captcha-token': 'valid-token',
      },
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('should accept x-turnstile-token header alias', async () => {
    // Mock success
    vi.spyOn(validationUtils, 'validateCaptchaToken').mockResolvedValue(true);

    const app = new Hono();
    app.use('/protected', requireCaptcha());
    app.get('/protected', (c) => c.text('ok'));

    const res = await app.request('http://localhost/protected', {
      headers: {
        'x-turnstile-token': 'valid-token',
      },
    });

    expect(res.status).toBe(200);
  });
});
