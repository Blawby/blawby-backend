import { auditService } from '@/shared/uploads/services/audit.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('@/shared/uploads/queries/audit-logs.repository', () => ({
  auditLogsRepository: { create: mocks.create },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('upload audit service', () => {
  it('writes through the transaction-aware repository', async () => {
    mocks.create.mockResolvedValue({ id: 'audit-1' });

    await auditService.log({
      upload_id: 'upload-1',
      organization_id: 'practice-1',
      user_id: 'user-1',
      action: 'downloaded',
    });

    expect(mocks.create).toHaveBeenCalledWith({
      upload_id: 'upload-1',
      organization_id: 'practice-1',
      user_id: 'user-1',
      action: 'downloaded',
      ip_address: undefined,
      user_agent: undefined,
      metadata: null,
    });
  });

  it('propagates audit persistence failures to prevent unaudited success', async () => {
    mocks.create.mockRejectedValue(new Error('audit storage unavailable'));

    await expect(
      auditService.log({ upload_id: 'upload-1', organization_id: 'practice-1', action: 'viewed' })
    ).rejects.toThrow('audit storage unavailable');
  });
});
