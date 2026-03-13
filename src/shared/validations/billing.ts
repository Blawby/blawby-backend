import { z } from 'zod';

// Billing onboarding session schema
export const createOnboardingSessionSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  organizationName: z.string().min(1, 'Organization name is required').optional(),
  organizationEmail: z.email('Invalid email format').optional(),
  country: z.string().min(2, 'Country code must be at least 2 characters').optional(),
  refreshUrl: z.url('Invalid refresh URL').optional(),
  returnUrl: z.url('Invalid return URL').optional(),
});

// Billing connected account schema
export const createConnectedAccountSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  accountType: z.enum(['express', 'standard', 'custom']).default('express'),
  country: z.string().min(2, 'Country code must be at least 2 characters').optional(),
  email: z.email('Invalid email format').optional(),
});

// Billing payment session schema
export const createPaymentSessionSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  amount: z.number().int().positive('Amount must be positive'),
  currency: z.string().length(3, 'Currency must be 3 characters').default('usd'),
  description: z.string().optional(),
  successUrl: z.url('Invalid success URL'),
  cancelUrl: z.url('Invalid cancel URL'),
});

// Billing login link schema
export const createLoginLinkSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  redirectUrl: z.url('Invalid redirect URL').optional(),
});

// Export inferred types
export type CreateOnboardingSessionRequest = z.infer<typeof createOnboardingSessionSchema>;
export type CreateConnectedAccountRequest = z.infer<typeof createConnectedAccountSchema>;
export type CreatePaymentSessionRequest = z.infer<typeof createPaymentSessionSchema>;
export type CreateLoginLinkRequest = z.infer<typeof createLoginLinkSchema>;
