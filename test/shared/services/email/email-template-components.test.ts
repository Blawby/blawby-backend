import {
  emailAction,
  emailCallout,
  emailDetails,
  emailDivider,
  emailLegalNotice,
} from '@/shared/services/email/templates/base.template';
import { describe, expect, it } from 'vitest';

describe('reusable email template components', () => {
  it('escapes copy and sanitizes action URLs', () => {
    expect(emailAction('Review & approve', 'https://app.blawby.com/review')).toContain('Review &amp; approve');
    expect(() => emailAction('Unsafe', ['javascript', 'alert(1)'].join(':'))).toThrow('safe absolute URL');
    expect(emailCallout('<review required>', 'warning')).toContain('&lt;review required&gt;');
    expect(emailLegalNotice('No attorney-client relationship <yet>.')).toContain('&lt;yet&gt;');
  });

  it('renders consistent detail rows and dividers', () => {
    const details = emailDetails([
      { label: 'Matter', value: 'Estate & Trust' },
      { label: 'Status', value: 'Review required' },
    ]);

    expect(details).toContain('Estate &amp; Trust');
    expect(details).toContain('Review required');
    expect(emailDivider()).toContain('<mj-divider');
  });
});
