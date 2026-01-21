import { z } from 'zod';
import { uuidValidator } from '@/shared/validations/common';

// Matter note validation schemas
export const createMatterNoteSchema = z.object({
  content: z.string().min(1, 'Content is required'),
});

export const updateMatterNoteSchema = z.object({
  content: z.string().min(1, 'Content is required'),
});

export const matterNoteIdParamSchema = z.object({
  uuid: uuidValidator,
  noteId: uuidValidator,
});

// Infer types
export type CreateMatterNoteRequest = z.infer<typeof createMatterNoteSchema>;
export type UpdateMatterNoteRequest = z.infer<typeof updateMatterNoteSchema>;
