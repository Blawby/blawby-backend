import { createRoute, z } from '@hono/zod-openapi';
import { createMemoSchema, updateMemoSchema, memoParamsSchema, clientMemoSchema } from '@/modules/user-details/validations/client-memos.validation';
import {
  updateUserDetailsSchema, listUserDetailsSchema,
  userDetailParamsSchema, practiceParamsSchema, userDetailSchema,
} from '@/modules/user-details/validations/user-details.validation';

// Common response schemas
const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.any().optional(),
}).openapi('ErrorResponse');

const notFoundResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
}).openapi('NotFoundResponse');

// ==================== USER DETAILS ====================

export const listUserDetailsRoute = createRoute({
  method: 'get',
  path: '/{practice_id}',
  tags: ['UserDetails'],
  summary: 'List user details or get by ID',
  description: 'Get all user details for an organization. Use the `client_id` query parameter to retrieve a specific record.',
  request: {
    params: practiceParamsSchema,
    query: listUserDetailsSchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ data: z.array(userDetailSchema), total: z.number() }) } },
      description: 'User details retrieved successfully',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Invalid request' },
  },
});

// Note: No POST/create route - clients are created via intake or invitation flows

export const updateUserDetailsRoute = createRoute({
  method: 'patch',
  path: '/{practice_id}/update/{id}',
  tags: ['UserDetails'],
  summary: 'Update user detail',
  description: 'Update user detail profile',
  request: {
    params: userDetailParamsSchema,
    body: { content: { 'application/json': { schema: updateUserDetailsSchema } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ data: userDetailSchema }) } }, description: 'User detail updated' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'User detail not found' },
  },
});

export const deleteUserDetailRoute = createRoute({
  method: 'delete',
  path: '/{practice_id}/delete/{id}',
  tags: ['UserDetails'],
  summary: 'Delete user detail',
  description: 'Delete a user detail (soft delete)',
  request: { params: userDetailParamsSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'User detail deleted' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'User detail not found' },
  },
});

// ==================== USER DETAIL MEMOS ====================

export const listUserDetailsMemosRoute = createRoute({
  method: 'get',
  path: '/{practice_id}/{id}/memos',
  tags: ['UserDetails: Memos'],
  summary: 'List user detail memos',
  description: 'Get all memos for a user detail',
  request: { params: userDetailParamsSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ data: z.array(clientMemoSchema) }) } }, description: 'Memos retrieved' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'User detail not found' },
  },
});

export const createUserDetailMemoRoute = createRoute({
  method: 'post',
  path: '/{practice_id}/{id}/memos',
  tags: ['UserDetails: Memos'],
  summary: 'Create user detail memo',
  description: 'Add a memo for a user detail',
  request: {
    params: userDetailParamsSchema,
    body: { content: { 'application/json': { schema: createMemoSchema } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: z.object({ data: clientMemoSchema }) } }, description: 'Memo created' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'User detail not found' },
  },
});

export const updateUserDetailsMemoRoute = createRoute({
  method: 'patch',
  path: '/{practice_id}/{id}/memos/update/{memo_id}',
  tags: ['UserDetails: Memos'],
  summary: 'Update user detail memo',
  description: 'Update a specific memo content',
  request: { params: memoParamsSchema, body: { content: { 'application/json': { schema: updateMemoSchema } } } },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ data: clientMemoSchema }) } }, description: 'Memo updated' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Memo or User detail not found' },
  },
});

export const deleteUserDetailsMemoRoute = createRoute({
  method: 'delete',
  path: '/{practice_id}/{id}/memos/delete/{memo_id}',
  tags: ['UserDetails: Memos'],
  summary: 'Delete user detail memo',
  description: 'Delete a specific memo',
  request: { params: memoParamsSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'Memo deleted' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Memo or User detail not found' },
  },
});
