import { z } from '@hono/zod-openapi';

export const organizationDirectoryRowSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().min(1),
  })
  .strict();

export const userDirectoryRowSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    email: z.email(),
  })
  .strict();
