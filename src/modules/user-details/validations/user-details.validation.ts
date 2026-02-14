import { z } from '@hono/zod-openapi';

export const createUserDetailsSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.email('Invalid email address').max(255),
  phone: z.string().max(50).optional(),

  // Address grouped for convenience but mapped in service
  address: z.object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    postal_code: z.string().max(20).optional(),
    country: z.string().length(2).default('US'),
  }).optional(),

  status: z.enum(['lead', 'active', 'inactive', 'archived']).default('lead'),
  currency: z.string().length(3).default('usd'),
  event_name: z.string().max(255).optional(),
}).openapi('CreateUserDetails');

export const updateUserDetailsSchema = createUserDetailsSchema.partial().openapi('UpdateUserDetails');

export const listUserDetailsSchema = z.object({
  user_uuid: z.uuid().optional(),
  search: z.string().optional(),
  status: z.enum(['lead', 'active', 'inactive', 'archived']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
}).openapi('ListUserDetails');

export const userDetailParamsSchema = z.object({
  practiceId: z.uuid('Invalid practice ID'),
  uuid: z.uuid('Invalid user detail ID'),
}).openapi('UserDetailParams');

export const practiceParamsSchema = z.object({
  practiceId: z.uuid('Invalid practice ID'),
}).openapi('PracticeParams');

// Alias for backwards compatibility
export const orgParamsSchema = practiceParamsSchema;

export const userDetailSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  user_id: z.uuid(),
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
  }),
  address_id: z.uuid().nullable(),
  status: z.enum(['lead', 'active', 'inactive', 'archived']),
  currency: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi('UserDetail');
