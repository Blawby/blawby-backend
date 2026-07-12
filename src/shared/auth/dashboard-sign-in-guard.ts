import { getStaffRoles } from '@/shared/auth/permissions';

export interface DashboardSignInCheckInput {
  /** Origin header of the incoming /sign-in/email request, if present. */
  origin: string | null;
  /** Origins that identify a dashboard/internal-console login attempt. */
  dashboardOrigins: string[];
  /** User row matching the submitted email, or null if no such user exists. */
  target: { role?: string | null } | null;
}

export type DashboardSignInCheckResult = { allowed: true } | { allowed: false };

/**
 * Gates dashboard-origin logins to staff accounts only. Logins from any other
 * origin are always allowed here — this check has no opinion on normal app
 * sign-in, only on requests presenting a dashboard origin.
 */
export const checkDashboardSignIn = (input: DashboardSignInCheckInput): DashboardSignInCheckResult => {
  // Origin scheme/host are case-insensitive per RFC 6454 — normalize both sides so a
  // Differently-cased Origin header can't make this look like a non-dashboard request
  // And skip the staff check.
  const normalizedOrigin = input.origin?.toLowerCase() ?? null;
  const normalizedDashboardOrigins = input.dashboardOrigins.map((origin) => origin.toLowerCase());
  const isDashboardOrigin = normalizedOrigin != null && normalizedDashboardOrigins.includes(normalizedOrigin);

  if (!isDashboardOrigin) {
    return { allowed: true };
  }

  if (!input.target || getStaffRoles(input.target.role).length === 0) {
    return { allowed: false };
  }

  return { allowed: true };
};
