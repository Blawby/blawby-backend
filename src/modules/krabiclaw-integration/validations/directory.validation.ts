import { z } from '@hono/zod-openapi';

const nonBlankString = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, {
    message: 'must not be blank',
  });

export const organizationDirectoryRowSchema = z
  .object({
    id: nonBlankString,
    name: nonBlankString,
    slug: nonBlankString,
  })
  .strict();

export const userDirectoryRowSchema = z
  .object({
    id: nonBlankString,
    name: nonBlankString,
    email: z.email(),
  })
  .strict();
