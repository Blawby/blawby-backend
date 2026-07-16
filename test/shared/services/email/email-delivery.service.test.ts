import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { sendEmail as SendEmail } from '@/shared/services/email/email.service';
import type { EmailJobPayload } from '@/shared/services/email/email.types';

interface MockEmailConfig {
  deliveryMode: 'log_only' | 'provider';
  resendApiKey: string | undefined;
}

const mocks = vi.hoisted(() => {
  const configEmail: MockEmailConfig = {
    deliveryMode: 'log_only',
    resendApiKey: 're_valid_test_key',
  };
  return {
    appConfigGet: vi.fn(),
    configEmail,
    insertValues: vi.fn(),
    resendSend: vi.fn(),
  };
});

vi.mock('@/shared/config', () => ({
  config: { email: mocks.configEmail },
}));

vi.mock('@/shared/database/connection', () => ({
  db: {
    insert: vi.fn(() => ({ values: mocks.insertValues })),
  },
}));

vi.mock('@/shared/services/app-config.service', () => ({
  appConfigService: { get: mocks.appConfigGet },
}));

vi.mock('@/shared/services/email/templates', () => ({
  renderTemplate: vi.fn(() => '<html>rendered</html>'),
}));

vi.mock('@/shared/utils/env', () => ({
  isProduction: vi.fn(() => true),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.resendSend };
  },
}));

let sendEmail: typeof SendEmail = () => Promise.reject(new Error('Email service test was not initialized'));

beforeAll(async () => {
  ({ sendEmail } = await import('@/shared/services/email/email.service'));
});

const payload: EmailJobPayload<'magic-link'> = {
  template: 'magic-link',
  to: 'client@example.com',
  subject: 'Secure sign in',
  data: { url: 'https://app.blawby.com/sign-in', year: 2026 },
  idempotencyKey: 'email-attempt-123',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configEmail.deliveryMode = 'log_only';
  mocks.configEmail.resendApiKey = 're_valid_test_key';
  mocks.insertValues.mockResolvedValue(undefined);
  mocks.appConfigGet.mockResolvedValue(null);
});

describe('sendEmail delivery modes', () => {
  it('renders and durably records log-only delivery without calling Resend', async () => {
    await expect(sendEmail(payload)).resolves.toEqual({
      success: true,
      messageId: 'log-only:magic-link:email-attempt-123',
    });

    expect(mocks.resendSend).not.toHaveBeenCalled();
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'sent',
        messageId: 'log-only:magic-link:email-attempt-123',
      })
    );
  });

  it('calls Resend in provider mode with the stable queue idempotency key', async () => {
    mocks.configEmail.deliveryMode = 'provider';
    mocks.resendSend.mockResolvedValue({ data: { id: 'resend-message-1' }, error: null });

    await expect(sendEmail(payload)).resolves.toEqual({ success: true, messageId: 'resend-message-1' });

    expect(mocks.resendSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: payload.to, subject: payload.subject }),
      { idempotencyKey: payload.idempotencyKey }
    );
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'sent',
        messageId: 'resend-message-1',
      })
    );
  });

  it('fast-fails provider mode without a valid provider key and records the failure', async () => {
    mocks.configEmail.deliveryMode = 'provider';
    mocks.configEmail.resendApiKey = undefined;

    const result = await sendEmail(payload);

    expect(result.success).toBe(false);
    expect(result.error).toContain('requires a valid RESEND_API_KEY');
    expect(mocks.resendSend).not.toHaveBeenCalled();
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });
});
