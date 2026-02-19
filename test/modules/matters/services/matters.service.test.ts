import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createTestContext } from '@/test/helpers/auth';
import { mattersService } from '@/modules/matters/services/matters.service';
import { getFullOrganization } from '@/modules/practice/services/organization.service';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import { MatterCreated, MatterUpdated, MatterDeleted } from '@/shared/events/definitions';
import type { User } from '@/shared/types/BetterAuth';

vi.mock('@/test/helpers/auth', () => ({
  createTestContext: vi.fn().mockResolvedValue({
    user: { id: 'test-user-id', email: 'test@example.com', name: 'Test User' },
    org: { id: 'test-org-id', name: 'Test Org', slug: 'test-org' },
  }),
}));

vi.mock('@/modules/practice/services/organization.service');
vi.mock('@/modules/matters/database/queries/matters.queries');
vi.mock('@/modules/matters/database/queries/matter-milestones.queries');
vi.mock('@/modules/matters/services/matter-activity.service');
vi.mock('@/shared/database', () => ({
  db: {
    transaction: vi.fn((cb) => cb({
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'new-matter-id', title: 'Test Matter', organization_id: 'test-org-id', created_at: new Date(), updated_at: new Date() }]),
    })),
  },
}));

vi.mock('@/shared/events/definitions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/events/definitions')>();
  return {
    ...actual,
    MatterCreated: { dispatch: vi.fn() },
    MatterUpdated: { dispatch: vi.fn() },
    MatterDeleted: { dispatch: vi.fn() },
    MatterStatusChanged: { dispatch: vi.fn() },
  };
});

describe('Matters Service', () => {
  let user: User;
  let organizationId: string;

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

    // Default mock for organization access
    vi.mocked(getFullOrganization).mockResolvedValue({
      success: true,
      data: {
        id: organizationId,
        name: context.org.name,
        slug: context.org.slug,
      } as any,
    });
  });

  it('should create a matter successfully', async () => {
    const matterData = {
      title: 'Test Matter',
      description: 'Test Description',
      billing_type: 'hourly' as const,
      status: 'active' as const,
    };

    const result = await mattersService.createMatter(organizationId, matterData, user, {});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe(matterData.title);
      expect(result.data.id).toBeDefined();
    }
    expect(MatterCreated.dispatch).toHaveBeenCalled();
  });

  it('should get a matter by ID', async () => {
    const mockMatter = {
      id: 'matter-123',
      organization_id: organizationId,
      title: 'Found Matter',
      assignees: [],
      created_at: new Date(),
      updated_at: new Date(),
    };

    vi.mocked(mattersQueries.findMatterByIdWithRelations).mockResolvedValue(mockMatter as any);

    const result = await mattersService.getMatterById(organizationId, 'matter-123', user, {});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('matter-123');
      expect(result.data.title).toBe('Found Matter');
    }
  });

  it('should list matters for an organization', async () => {
    vi.mocked(mattersQueries.listMattersByOrganization).mockResolvedValue({
      matters: [{ id: 'm1', title: 'M1', created_at: new Date(), updated_at: new Date() } as any],
      total: 1,
    });

    const result = await mattersService.listMatters(organizationId, {}, user, {});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.matters.length).toBe(1);
      expect(result.data.total).toBe(1);
    }
  });
});
