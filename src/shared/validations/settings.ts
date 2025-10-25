import { z } from 'zod';

// User settings schema
export const updateUserSettingsSchema = z.object({
  preferences: z.record(z.string(), z.any()).optional(),
  profile: z.record(z.string(), z.any()).optional(),
  privacy: z.record(z.string(), z.any()).optional(),
});

// Organization settings schema
export const updateOrganizationSettingsSchema = z.object({
  general: z.record(z.string(), z.any()).optional(),
  notifications: z.record(z.string(), z.any()).optional(),
  billing: z.record(z.string(), z.any()).optional(),
  security: z.record(z.string(), z.any()).optional(),
  integrations: z.record(z.string(), z.any()).optional(),
  features: z.record(z.string(), z.any()).optional(),
});

// Settings template schema
export const createSettingsTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  description: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  templateData: z.record(z.string(), z.any()),
  isPublic: z.boolean().default(false),
});

export const updateSettingsTemplateSchema
  = createSettingsTemplateSchema.partial();
