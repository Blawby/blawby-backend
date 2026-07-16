import { intakeAccepted } from '@/shared/services/email/templates/intake/intake-accepted';
import { intakeDeclined } from '@/shared/services/email/templates/intake/intake-declined';
import { describe, expect, it } from 'vitest';

describe('intake triage email templates', () => {
  it('renders the acceptance and secure-account next step in one email', async () => {
    const html = await intakeAccepted({
      recipientEmail: 'jane@example.com',
      recipientName: 'Jane Client',
      practiceName: 'Smith Legal',
      magicLinkUrl: 'https://api.blawby.com/api/auth/magic-link/verify?token=secure',
    });

    expect(html).toContain('Your Case Has Been Accepted');
    expect(html).toContain('Create Account');
    expect(html).toContain('token=secure');
    expect(html).toContain('securely communicate');
  });

  it('rejects a missing or unsafe acceptance link', async () => {
    await expect(
      intakeAccepted({
        recipientEmail: 'jane@example.com',
        recipientName: 'Jane Client',
        practiceName: 'Smith Legal',
        magicLinkUrl: ['javascript', 'alert(1)'].join(':'),
      })
    ).rejects.toThrow('A valid magic link URL is required');
  });

  it('renders a decline reason only when staff supplied one', async () => {
    const withReason = await intakeDeclined({
      recipientEmail: 'jane@example.com',
      recipientName: 'Jane Client',
      practiceName: 'Smith Legal',
      reason: 'Outside our licensed jurisdiction.',
    });
    const withoutReason = await intakeDeclined({
      recipientEmail: 'jane@example.com',
      recipientName: 'Jane Client',
      practiceName: 'Smith Legal',
    });

    expect(withReason).toContain('Outside our licensed jurisdiction.');
    expect(withoutReason).not.toContain('<strong>Reason:</strong>');
  });
});
