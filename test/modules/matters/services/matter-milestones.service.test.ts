import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createTestContext } from '@/test/helpers/auth';
import { matterMilestonesService } from '@/modules/matters/services/matter-milestones.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { matterMilestonesQueries } from '@/modules/matters/database/queries/matter-milestones.queries';
import type { User } from '@/shared/types/BetterAuth';

vi.mock('@/test/helpers/auth', () => ({
  createTestContext: vi.fn().mockResolvedValue({
    user: { id: 'test-user-id', email: 'test@example.com', name: 'Test User' },
    org: { id: 'test-org-id', name: 'Test Org', slug: 'test-org' },
  }),
}));

vi.mock('@/modules/matters/services/matters.service');
vi.mock('@/modules/matters/services/matter-activity.service');
vi.mock('@/modules/matters/database/queries/matter-milestones.queries');

describe('Matter Milestones Service', () => {
  let user: User;
  let organizationId: string;
  let matterId: string;

  beforeAll(async () => {
    const context = await createTestContext('owner');
    user = {
      id: context.user.id,
      email: context.user.email,
      name: context.user.name,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    } as unknown as User;
    organizationId = context.org.id;
    matterId = '00000000-0000-0000-0000-000000000001';

    // Default mock for matter access
    vi.mocked(mattersService.getMatterById).mockResolvedValue({
      success: true,
      data: { id: matterId, organization_id: organizationId } as any,
    });
  });

  it('should create a matter milestone successfully', async () => {
    const milestoneData = {
      description: 'Test Milestone',
      amount: 1000,
      due_date: '2026-12-31',
      status: 'pending' as const,
      order: 1,
    };
    vi.mocked(matterMilestonesQueries.createMatterMilestone).mockResolvedValue({
      id: 'milestone-123',
      matter_id: matterId,
      description: milestoneData.description,
      amount: milestoneData.amount,
      due_date: milestoneData.due_date,
      status: milestoneData.status,
      order: milestoneData.order,
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    const result = await matterMilestonesService.createMatterMilestone(organizationId, matterId, milestoneData, user, {});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe(milestoneData.description);
    }
  });

  it('should list milestones for a matter', async () => {
    vi.mocked(matterMilestonesQueries.listMatterMilestones).mockResolvedValue([]);
    const result = await matterMilestonesService.listMatterMilestones(organizationId, matterId, user, {});

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('should update a matter milestone', async () => {
    const milestoneId = 'milestone-123';
    vi.mocked(matterMilestonesQueries.findMatterMilestoneById).mockResolvedValue({
      id: milestoneId,
      matter_id: matterId,
      description: 'Old content',
    } as any);
    vi.mocked(matterMilestonesQueries.updateMatterMilestone).mockResolvedValue({
      id: milestoneId,
      matter_id: matterId,
      description: 'Updated Milestone',
      status: 'completed',
    } as any);

    const result = await matterMilestonesService.updateMatterMilestone(organizationId, matterId, milestoneId, {
      description: 'Updated Milestone',
      status: 'completed' as const,
    }, user, {});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('completed');
    }
  });

  it('should reorder milestones', async () => {
    const reorderData = {
      milestones: [
        { id: 'some-id-1', order: 1 },
      ],
    };
    vi.mocked(matterMilestonesQueries.findMatterMilestoneById).mockResolvedValue({
      id: 'some-id-1',
      matter_id: matterId,
    } as any);

    const result = await matterMilestonesService.reorderMilestones(organizationId, matterId, reorderData, user, {});
    expect(result.success).toBe(true);
  });

  it('should get milestone stats', async () => {
    vi.mocked(matterMilestonesQueries.getMilestoneStats).mockResolvedValue({
      total: 10,
      pending: 5,
      inProgress: 2,
      completed: 3,
      overdue: 1,
      totalAmount: 100000,
      completedAmount: 30000,
    });

    const result = await matterMilestonesService.getMilestoneStats(organizationId, matterId, user, {});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.completionPercentage).toBe(30);
      expect(result.data.totalAmount).toBe(1000);
    }
  });
});
