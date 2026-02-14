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
  id: uuidValidator,
  note_id: uuidValidator.openapi({
    param: { name: 'note_id', in: 'path' },
    description: 'Note ID (UUID)',
  }),
});

const listMatterNotesQuerySchema = z.object({
  note_id: uuidValidator.optional(),
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
  listMatterNotesQuerySchema,
  matterNoteSchema,
};
