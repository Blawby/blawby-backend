import { describe, expect, it } from 'vitest';
import {
  KRABICLAW_LEGAL_API_AUDIENCE,
  KRABICLAW_LEGAL_SCOPES,
  KRABICLAW_OAUTH_CLIENT_REFERENCE,
} from '@/shared/auth/krabiclaw-oauth';

describe('krabiclaw-oauth constants', () => {
  it('pins the legal API audience to the value KrabiClaw and the facade both hardcode', () => {
    expect(KRABICLAW_LEGAL_API_AUDIENCE).toBe('urn:blawby:legal-api');
  });

  it('exposes exactly the four route-scope strings from the facade plan, no more', () => {
    expect(KRABICLAW_LEGAL_SCOPES).toEqual(['legal:practice', 'legal:connect', 'legal:intakes', 'legal:engagements']);
  });

  it('uses a namespaced, non-empty client reference sentinel', () => {
    expect(KRABICLAW_OAUTH_CLIENT_REFERENCE).toBe('krabiclaw:legal-facade');
  });
});
