import type { KrabiClawActorKind } from '@/modules/krabiclaw-integration/types/identity.types';

export interface KrabiClawFacadeHeaders {
  externalOrganizationId: string;
  /** Required for both actor kinds (R4). Never triggers a D1 user lookup unless `actorKind === 'human'` (R20). */
  externalActorId: string;
  actorKind: KrabiClawActorKind;
  /** `x-krabiclaw-request-reference` — a UUID v4, present only when the caller sent it (KTD6). */
  requestReference: string | null;
  /** `x-krabiclaw-originating-client-ip` — present only when the caller sent it (R27). */
  trustedOriginatingClientIp: string | null;
}
