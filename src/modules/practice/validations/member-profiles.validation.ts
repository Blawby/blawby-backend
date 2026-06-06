import { z } from '@hono/zod-openapi';

const practiceAreaSchema = z.string().min(1).max(100);
const countySchema = z.string().min(1).max(100);

/**
 * PUT body — partial merge (only provided fields change), matching the client
 * intake profile / preferences upsert convention. Array fields are replaced
 * wholesale when provided.
 */
export const updateMemberProfileSchema = z
  .object({
    practice_areas: z.array(practiceAreaSchema).max(50).optional().openapi({
      description: 'Legal practice areas this member handles (e.g. "Family Law").',
    }),
    service_counties: z.array(countySchema).max(100).optional().openapi({
      description: 'Counties this member serves, used for matter routing.',
    }),
    max_capacity: z.number().int().min(0).nullable().optional().openapi({
      description: 'Maximum concurrent active matters. null = no explicit cap.',
    }),
    accepting_clients: z.boolean().optional().openapi({
      description: 'Whether this member is currently accepting new clients.',
    }),
  })
  .openapi('UpdateMemberProfile');

export const memberProfileSchema = z
  .object({
    id: z.uuid(),
    member_id: z.uuid(),
    user_id: z.uuid(),
    practice_areas: z.array(z.string()),
    service_counties: z.array(z.string()),
    max_capacity: z.number().int().nullable(),
    accepting_clients: z.boolean(),
    current_matters: z.number().int().openapi({
      description: "Computed: the member's current active matter count (live, not stored).",
    }),
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
  })
  .openapi('MemberProfile');

export type UpdateMemberProfileInput = z.infer<typeof updateMemberProfileSchema>;
export type MemberProfileResponse = z.infer<typeof memberProfileSchema>;

export const memberProfilesValidations = {
  updateMemberProfileSchema,
  memberProfileSchema,
};
