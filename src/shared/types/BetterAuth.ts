import type { BetterAuthInstance } from '@/shared/auth/better-auth';

export type User = BetterAuthInstance['$Infer']['Session']['user'];
export type Session = BetterAuthInstance['$Infer']['Session'];
export type Organization = BetterAuthInstance['$Infer']['Organization'];
export type ActiveOrganization
  = BetterAuthInstance['$Infer']['ActiveOrganization'];
export type Member = BetterAuthInstance['$Infer']['Member'];
export type Invitation = BetterAuthInstance['$Infer']['Invitation'];
