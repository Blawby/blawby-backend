import { z } from '@hono/zod-openapi';

export const createMemoSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  event_time: z.iso.datetime().optional(),
}).openapi('CreateMemo');

export const updateMemoSchema = z.object({
  content: z.string().min(1, 'Content is required'),
}).openapi('UpdateMemo');

export const memoParamsSchema = z.object({
  practiceId: z.uuid('Invalid practice ID'),
  uuid: z.uuid('Invalid client ID'),
  memoId: z.uuid('Invalid memo ID'),
}).openapi('MemoParams');

export const clientMemoSchema = z.object({
  id: z.uuid(),
  client_id: z.uuid(),
  created_by: z.uuid(),
  content: z.string(),
  event_time: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
}).openapi('ClientMemo');

