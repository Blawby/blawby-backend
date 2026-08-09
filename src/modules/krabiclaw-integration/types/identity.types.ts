export type KrabiClawActorKind = 'human' | 'anonymous';

export interface KrabiClawResolvedIdentity {
  organizationId: string;
  userId: string | null;
}
