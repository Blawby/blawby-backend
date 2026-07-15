import { createModuleTestApp } from '@/test/helpers/module-app';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

describe('createModuleTestApp', () => {
  it('mounts an individual module without booting the full application', async () => {
    const moduleApp = new Hono().get('/health', (c) => c.json({ status: 'ok' }));
    const app = createModuleTestApp({ protection: 'public' });
    app.route('/api/example', moduleApp);

    const response = await app.request('/api/example/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});
