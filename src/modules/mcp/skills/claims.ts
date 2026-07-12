import { findPracticeDetailsByOrganization } from '@/modules/practice/database/queries/practice-details.repository';
import { getSkillScopes, normalizePracticeSkills } from '@/modules/mcp/skills/registry';

const buildPracticeSkillClaims = async (organizationId: string) => {
  const details = await findPracticeDetailsByOrganization(organizationId);
  const enabledSkills = normalizePracticeSkills(details?.enabled_skills);
  return {
    enabled_skills: enabledSkills,
    skill_scopes: getSkillScopes(enabledSkills),
  };
};

export { buildPracticeSkillClaims };
