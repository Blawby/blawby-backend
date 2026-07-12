import { ForbiddenError } from '@casl/ability';
import {
  findPracticeDetailsByOrganization,
  findPracticeWithOrganization,
  upsertPracticeDetails,
} from '@/modules/practice/database/queries/practice-details.repository';
import {
  buildSystemPrompt,
  getSkillCatalog,
  getSkillScopes,
  normalizePracticeSkills,
  type PracticeSkillContext,
  type PracticeSkillKey,
} from '@/modules/mcp/skills/registry';
import type { ServiceContext } from '@/shared/types/service-context';

const loadSkillContext = async (organizationId: string): Promise<PracticeSkillContext> => {
  const [{ practice, organization }, details] = await Promise.all([
    findPracticeWithOrganization(organizationId),
    findPracticeDetailsByOrganization(organizationId),
  ]);

  if (!organization) {
    throw new Error(`Practice "${organizationId}" was not found.`);
  }

  const jurisdictions = (practice?.supported_states ?? [])
    .flatMap((entry) => (entry.states ?? []).map((state) => `${entry.country}-${state}`))
    .sort();
  const practiceAreas = (details?.services ?? []).map((service) => service.name).sort();

  return {
    practiceName: organization.name,
    jurisdictions,
    practiceAreas,
    billingIncrementMinutes: practice?.billing_increment_minutes ?? 1,
    consultationFeeCents: practice?.consultation_fee ?? null,
    introMessage: practice?.intro_message ?? null,
  };
};

const buildPracticeSkillsResponse = async (organizationId: string) => {
  const details = await findPracticeDetailsByOrganization(organizationId);
  const enabledSkills = normalizePracticeSkills(details?.enabled_skills);
  const context = await loadSkillContext(organizationId);
  return {
    enabled_skills: enabledSkills,
    available_skills: getSkillCatalog(),
    effective_scopes: getSkillScopes(enabledSkills),
    prompt_contribution: buildSystemPrompt(enabledSkills, context),
  };
};

const getPracticeSkills = async (ctx: ServiceContext) => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Organization');
  return await buildPracticeSkillsResponse(ctx.organizationId);
};

const getPublicPracticeSkillPrompt = async (organizationId: string) => {
  const { enabled_skills, prompt_contribution } = await buildPracticeSkillsResponse(organizationId);
  return { enabled_skills, prompt_contribution };
};

const updatePracticeSkills = async (enabledSkills: PracticeSkillKey[], ctx: ServiceContext) => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Organization');
  const normalized = normalizePracticeSkills(enabledSkills);
  await upsertPracticeDetails(ctx.organizationId, ctx.userId, { enabled_skills: normalized });
  return await buildPracticeSkillsResponse(ctx.organizationId);
};

export const practiceSkillsService = {
  getPracticeSkills,
  getPublicPracticeSkillPrompt,
  updatePracticeSkills,
};
