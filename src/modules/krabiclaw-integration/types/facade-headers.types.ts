import type { KrabiClawActorKind } from '@/modules/krabiclaw-integration/types/identity.types';

export interface KrabiClawFacadeHeaders {
  externalOrganizationId: string;
  externalActorId: string | null;
  actorKind: KrabiClawActorKind;
  /** `x-krabiclaw-request-reference` — a UUID v4, present only when the caller sent it (KTD6). */
  requestReference: string | null;
  /** `x-krabiclaw-originating-client-ip` — present only when the caller sent it (R27). */
  trustedOriginatingClientIp: string | null;
}
