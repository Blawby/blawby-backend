import { magicLinkDeliveryService } from '@/shared/auth/magic-link-delivery.service';
import { withMagicLinkDeliveryContext } from '@/shared/auth/magic-link-delivery-context';
import { EMAIL_TEMPLATES } from '@/shared/services/email/email.types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addEmailJob: vi.fn(),
}));

vi.mock('@/shared/queue/queue.manager', () => ({
  queueManager: {
    addEmailJob: mocks.addEmailJob,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.addEmailJob.mockResolvedValue(undefined);
});

describe('magicLinkDeliveryService', () => {
  it('queues one combined acceptance email inside accepted-intake context', async () => {
    await withMagicLinkDeliveryContext(
      {
        kind: 'intake_accepted',
        intakeId: 'intake-uuid-1',
        practiceName: 'Smith Legal',
        recipientName: 'Jane Client',
      },
      () =>
        magicLinkDeliveryService.deliverMagicLink({
          email: 'jane@example.com',
          url: 'https://api.blawby.com/api/auth/magic-link/verify?token=secure',
        })
    );

    expect(mocks.addEmailJob).toHaveBeenCalledOnce();
    expect(mocks.addEmailJob).toHaveBeenCalledWith(
      EMAIL_TEMPLATES.INTAKE_ACCEPTED,
      'jane@example.com',
      'Your case has been accepted — Smith Legal',
      {
        recipientEmail: 'jane@example.com',
        recipientName: 'Jane Client',
        practiceName: 'Smith Legal',
        magicLinkUrl: 'https://api.blawby.com/api/auth/magic-link/verify?token=secure',
      },
      { idempotencyKey: 'intake-accepted:intake-uuid-1' }
    );
  });

  it('preserves the ordinary magic-link email outside intake acceptance', async () => {
    await magicLinkDeliveryService.deliverMagicLink({
      email: 'user@example.com',
      url: 'https://api.blawby.com/api/auth/magic-link/verify?token=ordinary',
    });

    expect(mocks.addEmailJob).toHaveBeenCalledOnce();
    expect(mocks.addEmailJob).toHaveBeenCalledWith(
      EMAIL_TEMPLATES.MAGIC_LINK,
      'user@example.com',
      'Sign in to Blawby',
      expect.objectContaining({
        url: 'https://api.blawby.com/api/auth/magic-link/verify?token=ordinary',
      })
    );
  });
});
