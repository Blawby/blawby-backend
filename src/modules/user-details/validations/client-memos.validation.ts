import { z } from '@hono/zod-openapi';

export const createMemoSchema = z
  .object({
    content: z.string().min(1, 'Content is required'),
    event_time: z.iso.datetime().optional(),
  })
  .openapi('CreateMemo');

export const updateMemoSchema = z
  .object({
    content: z.string().min(1, 'Content is required'),
    event_time: z.iso.datetime().optional(),
  })
  .openapi('UpdateMemo');

export const memoParamsSchema = z
  .object({
    practice_id: z.uuid('Invalid practice ID'),
    id: z.uuid('Invalid client ID'),
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
    event_time: z.date().nullable(),
    created_at: z.date(),
    updated_at: z.date(),
  })
  .openapi('ClientMemo');
