import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createTestContext } from '@/test/helpers/auth';
import { matterNotesService } from '@/modules/matters/services/matter-notes.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { matterNotesQueries } from '@/modules/matters/database/queries/matter-notes.queries';
import type { User } from '@/shared/types/BetterAuth';

vi.mock('@/test/helpers/auth', () => ({
  createTestContext: vi.fn().mockResolvedValue({
    user: { id: 'test-user-id', email: 'test@example.com', name: 'Test User' },
    org: { id: 'test-org-id', name: 'Test Org', slug: 'test-org' },
  }),
}));

vi.mock('@/modules/matters/services/matters.service');
vi.mock('@/modules/matters/services/matter-activity.service');
vi.mock('@/modules/matters/database/queries/matter-notes.queries');

describe('Matter Notes Service', () => {
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

  it('should create a matter note successfully', async () => {
    const noteData = { content: 'This is a test note' };
    vi.mocked(matterNotesQueries.createMatterNote).mockResolvedValue({
      id: 'note-123',
      matter_id: matterId,
      user_id: user.id,
      content: noteData.content,
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    const result = await matterNotesService.createMatterNote(organizationId, matterId, noteData, user, {});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe(noteData.content);
    }
    expect(matterActivityService.logMatterActivity).toHaveBeenCalled();
  });

  it('should list notes for a matter', async () => {
    vi.mocked(matterNotesQueries.listMatterNotes).mockResolvedValue([]);
    const result = await matterNotesService.listMatterNotes(organizationId, matterId, user, {});

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('should update a matter note', async () => {
    const noteId = 'note-123';
    vi.mocked(matterNotesQueries.findMatterNoteById).mockResolvedValue({
      id: noteId,
      matter_id: matterId,
      content: 'Old content',
    } as any);
    vi.mocked(matterNotesQueries.updateMatterNote).mockResolvedValue({
      id: noteId,
      matter_id: matterId,
      content: 'Updated Content',
    } as any);

    const result = await matterNotesService.updateMatterNote(organizationId, matterId, noteId, { content: 'Updated Content' }, user, {});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe('Updated Content');
    }
  });

  it('should delete a matter note', async () => {
    const noteId = 'note-123';
    vi.mocked(matterNotesQueries.findMatterNoteById).mockResolvedValue({
      id: noteId,
      matter_id: matterId,
    } as any);

    const result = await matterNotesService.deleteMatterNote(organizationId, matterId, noteId, user, {});

    expect(result.success).toBe(true);
    expect(matterNotesQueries.deleteMatterNote).toHaveBeenCalledWith(noteId);
  });
});
