import { BaseEvent } from '@/shared/events/event';

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class SystemHealthCheckPerformed extends BaseEvent<Record<string, unknown>> {
  static type = 'system.health_check_performed' as const;
}

export class SystemErrorOccurred extends BaseEvent<{
  error: string;
  stack?: string;
  context?: Record<string, unknown>;
}> {
  static type = 'system.error_occurred' as const;
}

export class SystemPerformanceDegraded extends BaseEvent<Record<string, unknown>> {
  static type = 'system.performance_degraded' as const;
}

export class SessionCreated extends BaseEvent<{
  user_id: string;
  session_id: string;
}> {
  static type = 'session.created' as const;
}

export class SessionExpired extends BaseEvent<{
  user_id: string;
  session_id: string;
}> {
  static type = 'session.expired' as const;
}

export class SessionInvalidated extends BaseEvent<{
  user_id: string;
  session_id: string;
}> {
  static type = 'session.invalidated' as const;
}
