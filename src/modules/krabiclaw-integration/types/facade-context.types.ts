import type {
  KrabiClawOrganizationDirectoryRecord,
  KrabiClawUserDirectoryRecord,
} from '@/modules/krabiclaw-integration/types/directory.types';
import type { KrabiClawActorKind } from '@/modules/krabiclaw-integration/types/identity.types';
import type { LegalOperationContext } from '@/shared/types/legal-operation-context';

/**
 * The one Hono-only per-request facade context (KTD3). Route handlers read
 * it via `c.get('krabiclawFacadeRequestContext')`. Legal Operations, jobs,
 * and webhooks must never receive this object — pass only
 * `legalOperationContext` (or `toLegalOperationContext` output) to those.
 */
export interface KrabiClawFacadeRequestContext {
  /** Verified external organization ID from the trusted header contract. */
  readonly externalOrganizationId: string;
  /** Verified external actor ID — present for both actor kinds (R4); never resolved against D1 unless `actorKind === 'human'` (R20). */
  readonly externalActorId: string;
  readonly actorKind: KrabiClawActorKind;
  /** Trusted request-reference header value, present only when the route's `requestReferencePolicy` allows it. */
  readonly requestReference: string | null;
  /** Trusted originating-client-IP header value; only ever non-null on the engagement-acceptance route (R27). */
  readonly trustedOriginatingClientIp: string | null;
  readonly organizationDirectory: KrabiClawOrganizationDirectoryRecord;
  /** `null` for an anonymous actor — no D1 user lookup is ever performed for one (R20). */
  readonly userDirectory: KrabiClawUserDirectoryRecord | null;
  readonly legalOperationContext: LegalOperationContext;
}
