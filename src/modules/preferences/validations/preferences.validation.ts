/**
 * Preferences Validation
 *
 * Validation schemas for preferences API endpoints
 */

import { z } from 'zod';
import { PRODUCT_USAGE_OPTIONS } from '../schema/preferences.schema';

// Category-specific validation schemas
export const generalPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  accent_color: z.string().optional(),
  language: z.string().optional(),
  spoken_language: z.string().optional(),
  timezone: z.string().optional(),
  date_format: z.string().optional(),
  time_format: z.enum(['12h', '24h']).optional(),
});

export const notificationPreferencesSchema = z.object({
  responses_push: z.boolean().optional(),
  tasks_push: z.boolean().optional(),
  tasks_email: z.boolean().optional(),
  messaging_push: z.boolean().optional(),
});

export const securityPreferencesSchema = z.object({
  two_factor_enabled: z.boolean().optional(),
  email_notifications: z.boolean().optional(),
  login_alerts: z.boolean().optional(),
  session_timeout: z.number().int().positive().optional(),
});

export const accountPreferencesSchema = z.object({
  selected_domain: z.string().nullable().optional(),
  custom_domains: z.string().nullable().optional(),
  receive_feedback_emails: z.boolean().optional(),
  marketing_emails: z.boolean().optional(),
  security_alerts: z.boolean().optional(),
});

export const onboardingPreferencesSchema = z.object({
  birthday: z.string().optional(), // ISO date string
  primary_use_case: z.string().optional(),
  use_case_additional_info: z.string().optional(),
  completed: z.boolean().optional(),
  product_usage: z.array(z.enum(PRODUCT_USAGE_OPTIONS)).max(5).optional(),
});

export const profilePreferencesSchema = z.object({
  // Profile fields (phone, phoneCountryCode, dob) are now in users table
  // via Better Auth additionalFields. Use Better Auth updateUser endpoint.
  // This schema kept for backward compatibility but is empty.
});

// Category validation
export const preferenceCategorySchema = z.enum([
  'general',
  'notifications',
  'security',
  'account',
  'onboarding',
  'profile',
]);

export type PreferenceCategory = z.infer<typeof preferenceCategorySchema>;

// Legacy schema (for backward compatibility during migration)
// Note: phone and dob should be updated via Better Auth updateUser endpoint
export const updateUserDetailsSchema = z.object({
  phone: z.string().min(10).optional(),
  phoneCountryCode: z.string().optional(), // e.g., '+1', '+44'
  dob: z.coerce.date().optional(),
  productUsage: z.array(z.enum(PRODUCT_USAGE_OPTIONS)).max(5).optional(),
});

export type UpdateUserDetailsRequest = z.infer<typeof updateUserDetailsSchema>;

// Response schemas for OpenAPI documentation
export const preferencesResponseSchema = z
  .object({
    data: z.object({
      id: z.uuid(),
      user_id: z.uuid(),
      general: generalPreferencesSchema.nullable(),
      notifications: notificationPreferencesSchema.nullable(),
      security: securityPreferencesSchema.nullable(),
      account: accountPreferencesSchema.nullable(),
      onboarding: onboardingPreferencesSchema.nullable(),
      product_usage: z.array(z.enum(PRODUCT_USAGE_OPTIONS)).nullable(),
      created_at: z.date(),
      updated_at: z.date(),
    }),
  })
  .openapi('PreferencesResponse');

export const categoryPreferencesResponseSchema = z
  .object({
    data: z.record(z.string(), z.unknown()),
  })
  .openapi('CategoryPreferencesResponse');

export const errorResponseSchema = z
  .object({
    error: z.string(),
  })
  .openapi('ErrorResponse');

export const notFoundResponseSchema = z
  .object({
    error: z.string(),
  })
  .openapi('NotFoundResponse');

export const internalServerErrorResponseSchema = z
  .object({
    error: z.string(),
  })
  .openapi('InternalServerErrorResponse');

