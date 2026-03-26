import { z } from '@hono/zod-openapi';

export const createClientSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(255),
    email: z.email('Invalid email address').max(255),
    phone: z.string().max(50).optional(),

    // Address grouped for convenience but mapped in service
    address: z
      .object({
        line1: z.string().optional(),
        line2: z.string().optional(),
        city: z.string().max(100).optional(),
        state: z.string().max(100).optional(),
        postal_code: z.string().max(20).optional(),
        country: z.string().length(2).default('US'),
      })
      .optional(),

    status: z.enum(['lead', 'active', 'inactive', 'archived']).default('lead'),
    currency: z.string().length(3).default('usd'),
    event_name: z.string().max(255).optional(),
  })
  .openapi('CreateClient');

export const addressSchema = createClientSchema.shape.address.unwrap();
export type AddressInputSchema = z.infer<typeof addressSchema>;

export const updateClientSchema = createClientSchema
  .omit({ address: true })
  .partial()
  .extend({
    address: z
      .object({
        line1: z.string().optional(),
        line2: z.string().optional(),
        city: z.string().max(100).optional(),
        state: z.string().max(100).optional(),
        postal_code: z.string().max(20).optional(),
        country: z.string().length(2).optional(),
      })
      .optional(),
  })
  .openapi('UpdateClient');

export const listClientsSchema = z
  .object({
    search: z.string().optional(),
    status: z.enum(['lead', 'active', 'inactive', 'archived']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .openapi('ListClients');

export const clientParamsSchema = z
  .object({
    practice_id: z.uuid('Invalid practice ID'),
    id: z.uuid('Invalid client ID'),
  })
  .openapi('ClientParams');

export const practiceParamsSchema = z
  .object({
    practice_id: z.uuid('Invalid practice ID'),
  })
  .openapi('PracticeParams');

// Alias for backwards compatibility
export const orgParamsSchema = practiceParamsSchema;

export const clientSchema = z
  .object({
    id: z.uuid(),
    organization_id: z.uuid(),
    user_id: z.uuid().nullable(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    user: z
      .object({
        id: z.uuid(),
        name: z.string(),
        email: z.string(),
        phone: z.string().nullable(),
      })
      .nullable()
      .optional(),
    address_id: z.uuid().nullable(),
    status: z.enum(['lead', 'active', 'inactive', 'archived']),
    currency: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('Client');
