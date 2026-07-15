import { describe, expect, it } from 'vitest';

import { demoFileFixtures } from '../../scripts/demo-files.fixtures';

describe('demo file fixtures', () => {
  it('covers client- and practice-owned matter files without real identity data', () => {
    expect(demoFileFixtures.map(({ audience, scopeType }) => ({ audience, scopeType }))).toEqual([
      { audience: 'client', scopeType: 'matter' },
      { audience: 'practice_owner', scopeType: 'matter' },
    ]);

    for (const fixture of demoFileFixtures) {
      expect(fixture.content).toContain('FICTIONAL DATA');
      expect(fixture.content).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      expect(fixture.content).not.toMatch(/\b\d{3}[-.) ]+\d{3}[-. ]+\d{4}\b/);
      expect(new TextEncoder().encode(fixture.content).byteLength).toBeGreaterThan(0);
    }
  });

  it('uses stable unique identifiers and file names for idempotent upserts', () => {
    expect(new Set(demoFileFixtures.map((fixture) => fixture.id)).size).toBe(demoFileFixtures.length);
    expect(new Set(demoFileFixtures.map((fixture) => fixture.fileName)).size).toBe(demoFileFixtures.length);
  });
});
