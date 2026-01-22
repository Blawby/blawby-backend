import { z } from '@hono/zod-openapi';
import { uuidValidator } from '@/shared/validations/common';

// Matter note validation schemas
const createMatterNoteSchema = z.object({
  content: z.string().min(1, 'Content is required'),
});

const updateMatterNoteSchema = z.object({
  content: z.string().min(1, 'Content is required'),
});

const matterNoteIdParamSchema = z.object({
  uuid: uuidValidator,
  noteId: uuidValidator,
});

const matterNoteSchema = z.object({
  id: z.uuid(),
  matterId: z.uuid(),
  userId: z.uuid(),
  content: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).openapi('MatterNote');



export const matterNoteValidations = {
  createMatterNoteSchema,
  updateMatterNoteSchema,
  matterNoteIdParamSchema,
  matterNoteSchema,
};
