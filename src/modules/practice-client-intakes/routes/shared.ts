import { z } from '@hono/zod-openapi';

export const slugParamOpenAPISchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .openapi({
      param: {
        name: 'slug',
        in: 'path',
      },
      description: 'Organization slug',
      example: 'my-practice',
    }),
});

export const uuidParamOpenAPISchema = z.object({
  uuid: z.uuid().openapi({
    param: {
      name: 'uuid',
      in: 'path',
    },
    description: 'Practice client intake UUID (returned when creating an intake, used to identify the specific intake)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
});

export const practiceIdParamOpenAPISchema = z.object({
  practice_id: z.uuid().openapi({
    param: { name: 'practice_id', in: 'path' },
    description: 'Practice organization ID',
  }),
});
