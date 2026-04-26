import { z } from '@hono/zod-openapi';

// TODO(frontend): migrate memo event_time payloads to offset-aware timestamps.
const eventTimeSchema = z.union([z.iso.datetime({ offset: true }), z.iso.datetime({ local: true })]);

export const createMemoSchema = z
  .object({
    content: z.string().min(1, 'Content is required'),
    event_time: eventTimeSchema.optional(),
  })
  .openapi('CreateMemo');

export const updateMemoSchema = z
  .object({
    content: z.string().min(1, 'Content is required'),
    event_time: eventTimeSchema.optional(),
  })
  .openapi('UpdateMemo');

export const memoParamsSchema = z
  .object({
    practice_id: z.uuid('Invalid practice ID'),
    client_id: z.uuid('Invalid client ID'),
    memo_id: z.uuid().openapi({
      param: { name: 'memo_id', in: 'path' },
      description: 'Memo ID (UUID)',
    }),
  })
  .openapi('MemoParams');

export const clientMemoSchema = z
  .object({
    id: z.uuid(),
    client_id: z.uuid(),
    created_by: z.uuid(),
    content: z.string(),
    event_time: z.iso.datetime({ offset: true }).nullable(),
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
  })
  .openapi('ClientMemo');

// Grouped export for consistency
export const clientMemosValidations = {
  createMemoSchema,
  updateMemoSchema,
  memoParamsSchema,
  clientMemoSchema,
};
