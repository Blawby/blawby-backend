import { describe, expect, it } from 'vitest';
import { AUTH_CONFIG } from '@/shared/auth/config/authConfig';

describe('AUTH_CONFIG', () => {
  it('caches session data in a short-lived signed cookie', () => {
    expect(AUTH_CONFIG.session.cookieCache).toEqual({
      enabled: true,
      maxAge: 60,
    });
  });
});
