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
  matter_id: z.uuid(),
  user_id: z.uuid(),
  content: z.string(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
}).openapi('MatterNote');


export const matterNoteValidations = {
  createMatterNoteSchema,
  updateMatterNoteSchema,
  matterNoteIdParamSchema,
  matterNoteSchema,
};
