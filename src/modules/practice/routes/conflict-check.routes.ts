import { z } from '@hono/zod-openapi';
import { routeBuilder } from '@/shared/router/route-builder';
import { uuidValidator } from '@/shared/validations/common';

const conflictCheckRequestSchema = z
  .object({
    name: z.string().min(1),
    date_of_birth: z.iso.date().optional(),
    opposing_party: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    matter_id: uuidValidator.optional(),
    state: z.string().max(10).optional(),
    practice_service_key: z.string().optional(),
  })
  .strict();

const conflictCheckResultSchema = z
  .object({
    status: z.enum(['clear', 'review_required', 'conflicted', 'insufficient_data']),
    conflicting_matters: z.array(
      z.object({
        matter_id: z.uuid(),
        title: z.string(),
        similarity_score: z.number(),
        match_field: z.enum(['on_behalf_of', 'opposing_party']),
      })
    ),
    conflicting_contacts: z.array(
      z.object({
        client_id: z.uuid(),
        name: z.string(),
        similarity_score: z.number(),
        dob_match: z.boolean().nullable(),
      })
    ),
    warnings: z.array(
      z.object({
        type: z.enum(['unsupported_service', 'unsupported_state']),
        message: z.string(),
      })
    ),
    suggested_next_action: z.string(),
  })
  .openapi('ConflictCheckResult');

export const conflictCheckRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/conflict-check',
  tags: ['Practice'],
  summary: 'Run a conflict check',
  description: 'Fuzzy matches intake names and aliases against existing matters and clients using pg_trgm similarity.',
  request: {
    params: z.object({
      practice_id: z.uuid().openapi({
        param: {
          name: 'practice_id',
          in: 'path',
        },
      }),
    }),
    body: {
      content: {
        'application/json': {
          schema: conflictCheckRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Conflict check result',
      content: {
        'application/json': {
          schema: conflictCheckResultSchema,
        },
      },
    },
  },
});
