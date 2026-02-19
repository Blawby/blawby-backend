import { describe, it, expect, vi } from 'vitest';
import supertest from 'supertest';
import { getRequestListener } from '@hono/node-server';
import mattersApp from '@/modules/matters/http';
import { matterNotesService } from '@/modules/matters/services/matter-notes.service';

// Mock the service
vi.mock('@/modules/matters/services/matter-notes.service');

describe('Matter Notes API', () => {
  const practiceId = '123e4567-e89b-12d3-a456-426614174000';
  const matterId = '5e0a120a-87ac-4e61-90ab-38d91bf6cc8d';
  
  // Inject mock user
  mattersApp.use('*', async (c, next) => {
    c.set('user', { id: '789a1234-b56c-78d9-e012-345678901234', email: 'test@example.com' } as any);
    await next();
  });
  
  const request = supertest(getRequestListener(mattersApp.fetch));

  it('GET /:practice_id/:id/notes should list notes', async () => {
    vi.mocked(matterNotesService.listMatterNotes).mockResolvedValue({
      success: true,
      data: [{ id: '5e0a120a-87ac-4e61-90ab-38d91bf6cc8d', content: 'Note 1' }],
    } as any);

    const res = await request
      .get(`/${practiceId}/${matterId}/notes`);

    if (res.status !== 200) {
      console.log('Status:', res.status);
      console.log('Body:', JSON.stringify(res.body, null, 2));
    }

    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(1);
  });
});
