import { z } from '@hono/zod-openapi';
import { PRACTICE_SKILL_KEYS } from '@/modules/mcp/skills/registry';
import { practiceSkillsService } from '@/modules/mcp/skills/practice-skills.service';
import { routeBuilder } from '@/shared/router/route-builder';

const practiceIdParams = z.object({ practice_id: z.uuid() });
const skillKeySchema = z.enum(PRACTICE_SKILL_KEYS);
const skillCatalogItemSchema = z.object({
  key: skillKeySchema,
  label: z.string(),
  description: z.string(),
  version: z.number().int().positive(),
  scopes: z.array(z.string()),
});
const practiceSkillsResponseSchema = z.object({
  enabled_skills: z.array(skillKeySchema),
  available_skills: z.array(skillCatalogItemSchema),
  effective_scopes: z.array(z.string()),
  prompt_contribution: z.string(),
});
const updatePracticeSkillsSchema = z
  .object({ enabled_skills: z.array(skillKeySchema).max(PRACTICE_SKILL_KEYS.length) })
  .strict();

const getPracticeSkillsRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/skills',
  tags: ['Practice'],
  summary: 'Get practice AI skills',
  description:
    'Returns enabled structured capabilities, the versioned catalog, effective MCP scopes, and the deterministic prompt contribution.',
  mcp: {
    name: 'get_practice_skills',
    scope: 'practice:read',
    handler: async (_args, ctx) => practiceSkillsService.getPracticeSkills(ctx),
  },
  request: { params: practiceIdParams },
  responses: {
    200: {
      description: 'Practice AI skills retrieved',
      content: { 'application/json': { schema: practiceSkillsResponseSchema } },
    },
  },
});

const updatePracticeSkillsRoute = routeBuilder.build({
  method: 'put',
  path: '/{practice_id}/skills',
  tags: ['Practice'],
  summary: 'Update practice AI skills',
  description:
    'Replaces the enabled structured capability set. Existing OAuth access tokens retain their signed skill ceiling until they expire.',
  request: {
    params: practiceIdParams,
    body: { content: { 'application/json': { schema: updatePracticeSkillsSchema } } },
  },
  responses: {
    200: {
      description: 'Practice AI skills updated',
      content: { 'application/json': { schema: practiceSkillsResponseSchema } },
    },
  },
});

export { getPracticeSkillsRoute, practiceSkillsResponseSchema, updatePracticeSkillsRoute, updatePracticeSkillsSchema };
