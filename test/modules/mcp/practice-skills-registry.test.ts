import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRACTICE_SKILLS,
  buildSystemPrompt,
  getSkillCatalog,
  getSkillScopes,
  normalizePracticeSkills,
} from '@/modules/mcp/skills/registry';

const context = {
  practiceName: 'Example Law',
  jurisdictions: ['US-NC'],
  practiceAreas: ['Housing', 'Family'],
  billingIncrementMinutes: 6,
  consultationFeeCents: 15_000,
  introMessage: 'Tell us what happened.',
};

describe('practice AI skills registry', () => {
  it('defines the three required structured skills with versioned scope sets', () => {
    const catalog = getSkillCatalog();
    expect(catalog.map((skill) => skill.key)).toEqual(['matter_management', 'billing', 'client_intake']);
    expect(catalog.every((skill) => skill.version === 1 && skill.scopes.length > 0)).toBe(true);
  });

  it('normalizes order, removes duplicates, and rejects unknown skills', () => {
    expect(normalizePracticeSkills(['client_intake', 'matter_management', 'client_intake'])).toEqual([
      'matter_management',
      'client_intake',
    ]);
    expect(normalizePracticeSkills(undefined)).toEqual(DEFAULT_PRACTICE_SKILLS);
    expect(() => normalizePracticeSkills(['free_text_prompt'])).toThrow('Unknown practice AI skill');
  });

  it('derives deterministic scopes and prompt contributions from structured practice data', () => {
    const skills = normalizePracticeSkills(['billing', 'client_intake']);
    const scopes = getSkillScopes(skills);
    const first = buildSystemPrompt(skills, context);
    const second = buildSystemPrompt(skills, context);

    expect(scopes).toContain('invoices:write');
    expect(scopes).toContain('intakes:read');
    expect(scopes).not.toContain('matters:write');
    expect(first).toBe(second);
    expect(first).toContain('Billing increment: 6 minute(s).');
    expect(first).toContain('Jurisdictions: US-NC.');
    expect(first).not.toContain('matter_management');
  });

  it('produces an empty prompt and scope ceiling when every skill is disabled', () => {
    expect(getSkillScopes([])).toEqual([]);
    expect(buildSystemPrompt([], context)).toBe('');
  });
});
