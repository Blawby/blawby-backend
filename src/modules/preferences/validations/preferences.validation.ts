/**
 * Preferences Validation
 *
 * Validation schemas for preferences API endpoints
 */

import { z } from 'zod';
import {
  PRODUCT_USAGE_OPTIONS,
  PREFERENCE_CATEGORIES,
  THEME_OPTIONS,
  DATE_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS,
} from '@/modules/preferences/types/preferences.types';

// Category-specific validation schemas
const generalPreferencesSchema = z.object({
  theme: z.enum(THEME_OPTIONS).optional(),
  accent_color: z.string().optional(),
  language: z.string().optional(),
  spoken_language: z.string().optional(),
  timezone: z.string().optional(),
  date_format: z.enum(DATE_FORMAT_OPTIONS).optional(),
  time_format: z.enum(TIME_FORMAT_OPTIONS).optional(),
});

const notificationPreferencesSchema = z.object({
  messages_push: z.boolean().optional().openapi({
    description: 'Enable push notifications for messages',
    example: true,
  }),
  messages_email: z.boolean().optional().openapi({
    description: 'Enable email notifications for messages',
    example: true,
  }),
  messages_mentions_only: z.boolean().optional().openapi({
    description: 'Only notify on mentions in messages',
    example: false,
  }),
  payments_push: z.boolean().optional().openapi({
    description: 'Enable push notifications for payments',
    example: true,
  }),
  payments_email: z.boolean().optional().openapi({
    description: 'Enable email notifications for payments',
    example: true,
  }),
  intakes_push: z.boolean().optional().openapi({
    description: 'Enable push notifications for intakes',
    example: true,
  }),
  intakes_email: z.boolean().optional().openapi({
    description: 'Enable email notifications for intakes',
    example: true,
  }),
  matters_push: z.boolean().optional().openapi({
    description: 'Enable push notifications for matters',
    example: true,
  }),
  matters_email: z.boolean().optional().openapi({
    description: 'Enable email notifications for matters',
    example: true,
  }),
  system_push: z.boolean().optional().openapi({
    description: 'Enable push notifications for system events (enforced to true by server)',
    example: true,
  }),
  system_email: z.boolean().optional().openapi({
    description: 'Enable email notifications for system events (enforced to true by server)',
    example: true,
  }),
  desktop_push_enabled: z.boolean().optional().openapi({
    description: 'Enable desktop push notifications',
    example: false,
  }),
});

const securityPreferencesSchema = z.object({
  two_factor_enabled: z.boolean().optional(),
  email_notifications: z.boolean().optional(),
  login_alerts: z.boolean().optional(),
  session_timeout: z.number().int().positive().optional(),
});

const accountPreferencesSchema = z.object({
  selected_domain: z.string().nullable().optional(),
  custom_domains: z.string().nullable().optional(),
  receive_feedback_emails: z.boolean().optional(),
  marketing_emails: z.boolean().optional(),
  security_alerts: z.boolean().optional(),
});

const onboardingPreferencesSchema = z.object({
  birthday: z.string().optional(), // ISO date string
  primary_use_case: z.enum(PRODUCT_USAGE_OPTIONS).optional(),
  use_case_additional_info: z.string().optional(),
  completed: z.boolean().optional(),
  product_usage: z.array(z.enum(PRODUCT_USAGE_OPTIONS)).max(5).optional(),
  welcome_modal_shown: z.boolean().optional().openapi({
    description: 'Whether the welcome modal has been shown. Omit or false to show modal; set to true when dismissed.',
    example: false,
  }),
  practice_welcome_shown: z.boolean().optional().openapi({
    description: 'Whether the practice welcome modal has been shown. Omit or false to show modal; set to true when dismissed.',
    example: false,
  }),
});

const profilePreferencesSchema = z.object({
  // Profile fields (phone, phoneCountryCode, dob) are now in users table
  // via Better Auth additionalFields. Use Better Auth updateUser endpoint.
  // This schema kept for backward compatibility but is empty.
});

// Category validation - uses PREFERENCE_CATEGORIES from types as single source of truth
const preferenceCategorySchema = z.enum(PREFERENCE_CATEGORIES);


// Legacy schema (for backward compatibility during migration)
// Note: phone and dob should be updated via Better Auth updateUser endpoint
const updateUserDetailsSchema = z.object({
  phone: z.string().min(10).optional(),
  phone_country_code: z.string().optional(), // e.g., '+1', '+44'
  dob: z.iso.date().optional(),
  product_usage: z.array(z.enum(PRODUCT_USAGE_OPTIONS)).max(5).optional(),
});


// Response schemas for OpenAPI documentation
const preferencesResponseSchema = z
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

const categoryPreferencesResponseSchema = z
  .object({
    data: z.record(z.string(), z.unknown()),
  })
  .openapi('CategoryPreferencesResponse');

const errorResponseSchema = z
  .object({
    error: z.string(),
    message: z.string().optional(),
    details: z.array(z.object({
      field: z.string(),
      message: z.string(),
      code: z.string(),
    })).optional(),
  })
  .openapi('ErrorResponse');

const notFoundResponseSchema = z
  .object({
    error: z.string(),
  })
  .openapi('NotFoundResponse');

const internalServerErrorResponseSchema = z
  .object({
    error: z.string(),
  })
  .openapi('InternalServerErrorResponse');

export const preferenceValidations = {
  generalPreferencesSchema,
  notificationPreferencesSchema,
  securityPreferencesSchema,
  accountPreferencesSchema,
  onboardingPreferencesSchema,
  profilePreferencesSchema,
  preferenceCategorySchema,
  updateUserDetailsSchema,
  preferencesResponseSchema,
  categoryPreferencesResponseSchema,
  errorResponseSchema,
  notFoundResponseSchema,
  internalServerErrorResponseSchema,
};
