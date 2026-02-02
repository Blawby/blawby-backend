import { z } from '@hono/zod-openapi';

/**
 * Standard address schema for reuse across the application.
 */
export const addressSchema = z.object({
  line1: z.string().optional().openapi({ description: 'Address line 1', example: '123 Main St' }),
  line2: z.string().optional().openapi({ description: 'Address line 2', example: 'Suite 100' }),
  city: z.string().optional().openapi({ description: 'City', example: 'New York' }),
  state: z.string().optional().openapi({ description: 'State/Province', example: 'NY' }),
  postal_code: z.string().optional().openapi({ description: 'Postal/Zip Code', example: '10001' }),
  country: z.string().optional().openapi({ description: 'Country (2-letter ISO code)', example: 'US' }),
}).openapi('Address');

export type Address = z.infer<typeof addressSchema>;
