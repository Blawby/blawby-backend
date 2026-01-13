import { test } from 'tap';
import { Hono } from 'hono';
import { requireCaptcha } from '../../src/shared/middleware/requireCaptcha';
import * as validationUtils from '../../src/shared/utils/captchaValidation';

// Mock validation utility
const originalValidate = validationUtils.validateCaptchaToken;

test('requireCaptcha middleware', async (t) => {
  t.teardown(() => {
    // Restore original function
    (validationUtils as any).validateCaptchaToken = originalValidate;
  });

  t.test('should return 403 if token is missing', async (t) => {
    const app = new Hono();
    app.use('/protected', requireCaptcha());
    app.get('/protected', (c) => c.text('ok'));

    const res = await app.request('http://localhost/protected');
    t.equal(res.status, 403);
    const body = await res.json();
    t.equal(body.error, 'Forbidden');
    t.equal(body.message, 'Captcha token is missing');
  });

  t.test('should return 403 if validation fails', async (t) => {
    // Mock failure
    (validationUtils as any).validateCaptchaToken = async () => false;

    const app = new Hono();
    app.use('/protected', requireCaptcha());
    app.get('/protected', (c) => c.text('ok'));

    const res = await app.request('http://localhost/protected', {
      headers: {
        'x-captcha-token': 'invalid-token',
      },
    });

    t.equal(res.status, 403);
    const body = await res.json();
    t.equal(body.error, 'Forbidden');
    t.equal(body.message, 'Captcha validation failed');
  });

  t.test('should pass if validation succeeds', async (t) => {
    // Mock success
    (validationUtils as any).validateCaptchaToken = async () => true;

    const app = new Hono();
    app.use('/protected', requireCaptcha());
    app.get('/protected', (c) => c.text('ok'));

    const res = await app.request('http://localhost/protected', {
      headers: {
        'x-captcha-token': 'valid-token',
      },
    });

    t.equal(res.status, 200);
    t.equal(await res.text(), 'ok');
  });

  t.test('should accept x-turnstile-token header alias', async (t) => {
    // Mock success
    (validationUtils as any).validateCaptchaToken = async () => true;

    const app = new Hono();
    app.use('/protected', requireCaptcha());
    app.get('/protected', (c) => c.text('ok'));

    const res = await app.request('http://localhost/protected', {
      headers: {
        'x-turnstile-token': 'valid-token',
      },
    });

    t.equal(res.status, 200);
  });
});
