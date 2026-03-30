import { BaseEvent } from '@/shared/events/event';

// ═══════════════════════════════════════════════════════════════════════════
// INTAKE EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fired when an intake submission is complete (either payment bypassed or payment succeeded).
 * Used to trigger prospect-facing confirmation and practice-facing notification emails.
 */
export class IntakeSubmitted extends BaseEvent<{
  intake_id: string;
  organization_id: string;
  organization_name: string;
  billing_email: string | null;
  client_email: string;
  client_name: string;
  amount: number;
  currency: string;
}> {
  static type = 'intake.submitted' as const;
}

/**
 * Fired when a staff member triages an intake (accepted or declined).
 * Used to trigger prospect-facing acceptance/decline emails.
 */
export class IntakeTriaged extends BaseEvent<{
  intake_id: string;
  organization_id: string;
  organization_name: string;
  triage_status: string;
  triage_reason: string | null;
  client_email: string;
  client_name: string;
}> {
  static type = 'intake.triaged' as const;
}
