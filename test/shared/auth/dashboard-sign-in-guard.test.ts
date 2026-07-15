import { describe, expect, it } from 'vitest';
import { checkDashboardAccountSignIn, checkDashboardSignIn } from '@/shared/auth/dashboard-sign-in-guard';

const DASHBOARD_ORIGIN = 'https://console.blawby.com';
const OTHER_DASHBOARD_ORIGIN = 'https://console-staging.blawby.com';
const DASHBOARD_ORIGINS = [DASHBOARD_ORIGIN, OTHER_DASHBOARD_ORIGIN];

describe('checkDashboardSignIn', () => {
  it('allows a non-staff login from the main app origin', () => {
    const result = checkDashboardSignIn({
      origin: 'https://app.blawby.com',
      dashboardOrigins: DASHBOARD_ORIGINS,
      target: { role: 'user' },
    });

    expect(result).toEqual({ allowed: true });
  });

  it('allows a non-staff login when there is no origin header at all', () => {
    const result = checkDashboardSignIn({
      origin: null,
      dashboardOrigins: DASHBOARD_ORIGINS,
      target: { role: 'user' },
    });

    expect(result).toEqual({ allowed: true });
  });

  it('allows a non-staff login when no dashboard origins are configured', () => {
    const result = checkDashboardSignIn({
      origin: DASHBOARD_ORIGIN,
      dashboardOrigins: [],
      target: { role: 'user' },
    });

    expect(result).toEqual({ allowed: true });
  });

  it('blocks a non-staff login on the dashboard origin', () => {
    const result = checkDashboardSignIn({
      origin: DASHBOARD_ORIGIN,
      dashboardOrigins: DASHBOARD_ORIGINS,
      target: { role: 'user' },
    });

    expect(result).toEqual({ allowed: false });
  });

  it('blocks a non-staff login when the origin header casing differs from the configured origin', () => {
    const result = checkDashboardSignIn({
      origin: 'HTTPS://Console.Blawby.com',
      dashboardOrigins: DASHBOARD_ORIGINS,
      target: { role: 'user' },
    });

    expect(result).toEqual({ allowed: false });
  });

  it('allows a staff login when the origin header casing differs from the configured origin', () => {
    const result = checkDashboardSignIn({
      origin: 'HTTPS://Console.Blawby.com',
      dashboardOrigins: DASHBOARD_ORIGINS,
      target: { role: 'ops' },
    });

    expect(result).toEqual({ allowed: true });
  });

  it('blocks a login on the dashboard origin for an email with no matching user', () => {
    const result = checkDashboardSignIn({
      origin: DASHBOARD_ORIGIN,
      dashboardOrigins: DASHBOARD_ORIGINS,
      target: null,
    });

    expect(result).toEqual({ allowed: false });
  });

  it('blocks a login on the dashboard origin for a user with a null role', () => {
    const result = checkDashboardSignIn({
      origin: DASHBOARD_ORIGIN,
      dashboardOrigins: DASHBOARD_ORIGINS,
      target: { role: null },
    });

    expect(result).toEqual({ allowed: false });
  });

  it('allows a staff login on the dashboard origin', () => {
    const result = checkDashboardSignIn({
      origin: DASHBOARD_ORIGIN,
      dashboardOrigins: DASHBOARD_ORIGINS,
      target: { role: 'ops' },
    });

    expect(result).toEqual({ allowed: true });
  });

  it('allows a staff login on any configured dashboard origin, not just the first', () => {
    const result = checkDashboardSignIn({
      origin: OTHER_DASHBOARD_ORIGIN,
      dashboardOrigins: DASHBOARD_ORIGINS,
      target: { role: 'support' },
    });

    expect(result).toEqual({ allowed: true });
  });

  it('allows a staff login where staff role is one entry in a comma-separated role string', () => {
    const result = checkDashboardSignIn({
      origin: DASHBOARD_ORIGIN,
      dashboardOrigins: DASHBOARD_ORIGINS,
      target: { role: 'user,super_admin' },
    });

    expect(result).toEqual({ allowed: true });
  });
});

describe('checkDashboardAccountSignIn', () => {
  it('blocks dashboard endpoint login for an account with no matching user', () => {
    const result = checkDashboardAccountSignIn(null);

    expect(result).toEqual({ allowed: false });
  });

  it('blocks dashboard endpoint login for a non-staff account', () => {
    const result = checkDashboardAccountSignIn({ role: 'user' });

    expect(result).toEqual({ allowed: false });
  });

  it('allows dashboard endpoint login for a staff account', () => {
    const result = checkDashboardAccountSignIn({ role: 'support' });

    expect(result).toEqual({ allowed: true });
  });

  it('allows dashboard endpoint login when staff role is one entry in a comma-separated role string', () => {
    const result = checkDashboardAccountSignIn({ role: 'user,super_admin' });

    expect(result).toEqual({ allowed: true });
  });
});
