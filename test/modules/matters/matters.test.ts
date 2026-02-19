import { describe, it, expect, vi } from 'vitest';
import supertest from 'supertest';
import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';
import mattersApp from '@/modules/matters/http';
import { mattersService } from '@/modules/matters/services/matters.service';

// Mock the service
vi.mock('@/modules/matters/services/matters.service');

describe('Matters API', () => {
  const practiceId = '123e4567-e89b-12d3-a456-426614174000';
  
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('user', { id: '789a1234-b56c-78d9-e012-345678901234', email: 'test@example.com' } as any);
    await next();
  });
  app.route('/', mattersApp);
  
  const request = supertest(getRequestListener(app.fetch));

  it('POST /:practice_id/create should create matter', async () => {
    const mockMatter = {
      id: '5e0a120a-87ac-4e61-90ab-38d91bf6cc8d',
      title: 'New Matter',
      organization_id: practiceId,
      billing_type: 'hourly',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.mocked(mattersService.createMatter).mockResolvedValue({
      success: true,
      data: mockMatter,
    } as any);

    const res = await request
      .post(`/${practiceId}/create`)
      .send({
        title: 'New Matter',
        billing_type: 'hourly',
        status: 'active',
        admin_hourly_rate: 100,
      });

    expect(res.status).toBe(201);
    expect(res.body.matter.id).toBe(mockMatter.id);
  });

  it('GET /:practice_id should list matters', async () => {
    vi.mocked(mattersService.listMatters).mockResolvedValue({
      success: true,
      data: {
        matters: [{ 
          id: '5e0a120a-87ac-4e61-90ab-38d91bf6cc8d', 
          title: 'M1', 
          billing_type: 'hourly',
          status: 'active',
          organization_id: practiceId,
          created_at: new Date().toISOString(), 
          updated_at: new Date().toISOString() 
        }],
        total: 1,
      },
    } as any);

    const res = await request
      .get(`/${practiceId}`);

    expect(res.status).toBe(200);
    expect(res.body.matters).toHaveLength(1);
  });
});
