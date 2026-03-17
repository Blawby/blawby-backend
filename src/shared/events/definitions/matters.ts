import { BaseEvent } from '../event';

// ═══════════════════════════════════════════════════════════════════════════
// MATTER EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class MatterCreated extends BaseEvent<{
  matter_id: string;
  organization_id: string;
  title: string;
  billing_type: string;
}> {
  static type = 'matter.created' as const;
}

export class MatterUpdated extends BaseEvent<{
  matter_id: string;
  organization_id: string;
  changes: Record<string, unknown>;
}> {
  static type = 'matter.updated' as const;
}

export class MatterDeleted extends BaseEvent<{
  matter_id: string;
  organization_id: string;
}> {
  static type = 'matter.deleted' as const;
}

export class MatterStatusChanged extends BaseEvent<{
  matter_id: string;
  organization_id: string;
  old_status: string;
  new_status: string;
}> {
  static type = 'matter.status_changed' as const;
}

export class RetainerLowBalance extends BaseEvent<{
  matter_id: string;
  organization_id: string;
  current_balance: number;
  threshold: number;
}> {
  static type = 'matter.retainer_low_balance' as const;
}
