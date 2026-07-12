import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/practice/database/queries/practice-details.repository', () => ({
  findPracticeDetailsByOrganization: vi.fn(),
  findPracticeWithOrganization: vi.fn(),
  upsertPracticeDetails: vi.fn(),
}));

import { practiceSkillsService } from '@/modules/mcp/skills/practice-skills.service';
import {
  findPracticeDetailsByOrganization,
  findPracticeWithOrganization,
  upsertPracticeDetails,
} from '@/modules/practice/database/queries/practice-details.repository';
import { defineAbilityFor } from '@/shared/auth/abilities';
import type { ServiceContext } from '@/shared/types/service-context';

const organizationId = 'practice_1';
const context = {
  organizationId,
  userId: 'owner_1',
  ability: defineAbilityFor('owner'),
} as unknown as ServiceContext;

describe('practiceSkillsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findPracticeDetailsByOrganization).mockResolvedValue({
      enabled_skills: ['billing'],
      services: [{ name: 'Family law' }],
    } as never);
    vi.mocked(findPracticeWithOrganization).mockResolvedValue({
      organization: { name: 'Example Law' },
      practice: {
        billing_increment_minutes: 6,
        consultation_fee: 15_000,
        intro_message: 'Tell us what happened.',
        supported_states: [{ country: 'US', states: ['NC'] }],
      },
    } as never);
  });

  it('returns only enabled capabilities, their scopes, and deterministic practice context', async () => {
    const result = await practiceSkillsService.getPracticeSkills(context);

    expect(result.enabled_skills).toEqual(['billing']);
    expect(result.effective_scopes).toContain('invoices:write');
    expect(result.effective_scopes).not.toContain('matters:write');
    expect(result.prompt_contribution).toContain('Billing increment: 6 minute(s).');
  });

  it('limits the public chatbot contract to enabled skills and assembled prompt text', async () => {
    const result = await practiceSkillsService.getPublicPracticeSkillPrompt(organizationId);

    expect(result).toEqual({
      enabled_skills: ['billing'],
      prompt_contribution: expect.stringContaining('Billing increment: 6 minute(s).'),
    });
    expect(result).not.toHaveProperty('available_skills');
    expect(result).not.toHaveProperty('effective_scopes');
  });

  it('persists the normalized replacement set and returns the resulting contract', async () => {
    vi.mocked(findPracticeDetailsByOrganization).mockResolvedValue({ enabled_skills: ['matter_management'] } as never);

    const result = await practiceSkillsService.updatePracticeSkills(['matter_management'], context);

    expect(upsertPracticeDetails).toHaveBeenCalledWith(organizationId, 'owner_1', {
      enabled_skills: ['matter_management'],
    });
    expect(result.enabled_skills).toEqual(['matter_management']);
    expect(result.effective_scopes).toContain('matters:write');
  });
});
