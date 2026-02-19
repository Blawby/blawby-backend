import { describe, it, expect, vi } from 'vitest';
import supertest from 'supertest';
import { getRequestListener } from '@hono/node-server';
import mattersApp from '@/modules/matters/http';
import { matterMilestonesService } from '@/modules/matters/services/matter-milestones.service';

// Mock the service
vi.mock('@/modules/matters/services/matter-milestones.service');

describe('Matter Milestones API', () => {
  const practiceId = '123e4567-e89b-12d3-a456-426614174000';
  const matterId = '5e0a120a-87ac-4e61-90ab-38d91bf6cc8d';
  
  // Inject mock user
  mattersApp.use('*', async (c, next) => {
    c.set('user', { id: '789a1234-b56c-78d9-e012-345678901234', email: 'test@example.com' } as any);
    await next();
  });
  
  const request = supertest(getRequestListener(mattersApp.fetch));

  it('GET /:practice_id/:id/milestones should list milestones', async () => {
    vi.mocked(matterMilestonesService.listMatterMilestones).mockResolvedValue({
      success: true,
      data: [{ id: '5e0a120a-87ac-4e61-90ab-38d91bf6cc8d', description: 'Milestone 1' }],
    } as any);

    const res = await request
      .get(`/${practiceId}/${matterId}/milestones`);

    expect(res.status).toBe(200);
    expect(res.body.milestones).toHaveLength(1);
  });

  it('POST /:practice_id/:id/milestones should create milestone', async () => {
    const mockMilestone = { id: '5e0a120a-87ac-4e61-90ab-38d91bf6cc8d', description: 'New Milestone' };
    vi.mocked(matterMilestonesService.createMatterMilestone).mockResolvedValue({
      success: true,
      data: mockMilestone,
    } as any);

    const res = await request
      .post(`/${practiceId}/${matterId}/milestones`)
      .send({
        description: 'New Milestone',
        amount: 2000,
        due_date: '2026-12-31',
        status: 'pending',
        order: 2,
      });

    expect(res.status).toBe(201);
    expect(res.body.milestone.description).toBe('New Milestone');
  });
});
