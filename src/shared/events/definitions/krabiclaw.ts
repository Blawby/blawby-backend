import { BaseEvent } from '@/shared/events/event';

export interface KrabiClawActorAttributedPayload extends Record<string, unknown> {
  external_organization_id: string;
  external_actor_id: string | null;
  actor_kind: 'human' | 'anonymous';
  oauth_client_id: string;
  resolved_organization_id: string;
  resolved_user_id: string | null;
  method: string;
  path: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// KRABICLAW FACADE EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class KrabiClawActorAttributed extends BaseEvent<KrabiClawActorAttributedPayload> {
  static type = 'krabiclaw.actor_attributed' as const;
}
