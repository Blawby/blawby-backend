import { EMAIL_TEMPLATES } from '@/shared/services/email/email.types';
import { renderTemplate } from '@/shared/services/email/templates';
import { describe, expect, it } from 'vitest';

describe('email template rendering', () => {
  it('uses one asynchronous contract for plain HTML templates', async () => {
    const rendering = renderTemplate(EMAIL_TEMPLATES.MAGIC_LINK, {
      url: 'https://example.com/sign-in',
      year: 2026,
    });

    expect(rendering).toBeInstanceOf(Promise);
    await expect(rendering).resolves.toContain('Sign in to Blawby');
  });

  it('awaits MJML 5 before returning rendered HTML', async () => {
    const rendering = renderTemplate(EMAIL_TEMPLATES.PRACTICE_INVITATION, {
      recipientEmail: 'member@example.com',
      recipientName: 'Member',
      inviterName: 'Owner',
      practiceName: 'Example Practice',
      inviteLink: 'https://example.com/invite',
    });

    expect(rendering).toBeInstanceOf(Promise);
    const html = await rendering;
    expect(typeof html).toBe('string');
    expect(html).toContain('Example Practice');
    expect(html).not.toContain('[object Promise]');
  });
});
