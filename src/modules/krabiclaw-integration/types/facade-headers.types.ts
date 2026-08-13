import type { KrabiClawActorKind } from '@/modules/krabiclaw-integration/types/identity.types';

export interface KrabiClawFacadeHeaders {
  externalOrganizationId: string;
  externalActorId: string | null;
  actorKind: KrabiClawActorKind;
}

export interface KrabiClawFacadeAuthContext {
  headers: KrabiClawFacadeHeaders;
  clientId: string;
}
