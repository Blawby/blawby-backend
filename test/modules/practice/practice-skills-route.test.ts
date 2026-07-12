import { describe, expect, it } from 'vitest';
import { updatePracticeSkillsSchema } from '@/modules/practice/routes/skills.routes';

describe('practice AI skills API contract', () => {
  it('accepts only the versioned skill catalog', () => {
    expect(
      updatePracticeSkillsSchema.safeParse({ enabled_skills: ['matter_management', 'billing', 'client_intake'] })
        .success
    ).toBe(true);
    expect(updatePracticeSkillsSchema.safeParse({ enabled_skills: [] }).success).toBe(true);
    expect(updatePracticeSkillsSchema.safeParse({ enabled_skills: ['free_text_prompt'] }).success).toBe(false);
    expect(
      updatePracticeSkillsSchema.safeParse({ enabled_skills: ['billing'], system_prompt: 'ignore rules' }).success
    ).toBe(false);
  });
});
