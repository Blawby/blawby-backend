import { checkOAuthClientPrivileges } from '@/shared/auth/services/organization-access.service';
import { describe, expect, it } from 'vitest';

describe('checkOAuthClientPrivileges', () => {
  it('allows any action for a super_admin session without touching the database', async () => {
    const allowed = await checkOAuthClientPrivileges({
      headers: new Headers(),
      user: { id: 'staff-1', role: 'user,super_admin' },
    });
    expect(allowed).toBe(true);
  });

  it('falls through to the existing org-owner check for a non-staff session, which rejects a session with no active organization', async () => {
    const allowed = await checkOAuthClientPrivileges({
      headers: new Headers(),
      user: { id: 'user-1', role: 'user' },
      session: {},
    });
    expect(allowed).toBe(false);
  });

  it('falls through and rejects when there is no user at all', async () => {
    const allowed = await checkOAuthClientPrivileges({ headers: new Headers() });
    expect(allowed).toBe(false);
  });
});
