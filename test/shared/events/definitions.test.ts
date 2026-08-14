import {
  ConflictCheckCompleted,
  EngagementContractAccepted,
  EngagementContractCreated,
  EngagementContractDeclined,
  EngagementContractSent,
  EventClasses,
  KrabiClawActorAttributed,
} from '@/shared/events/definitions';
import { describe, expect, it } from 'vitest';

describe('event definitions', () => {
  it('registers engagement-contract events in the central event map', () => {
    expect(EventClasses['engagement_contract.created']).toBe(EngagementContractCreated);
    expect(EventClasses['engagement_contract.sent']).toBe(EngagementContractSent);
    expect(EventClasses['engagement_contract.accepted']).toBe(EngagementContractAccepted);
    expect(EventClasses['engagement_contract.declined']).toBe(EngagementContractDeclined);
    expect(EventClasses['conflict_check.completed']).toBe(ConflictCheckCompleted);
  });

  it('registers the krabiclaw actor-attribution event in the central event map', () => {
    expect(EventClasses['krabiclaw.actor_attributed']).toBe(KrabiClawActorAttributed);
  });
});
